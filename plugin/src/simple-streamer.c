#include <obs-module.h>
#include <obs-frontend-api.h>
#include <util/platform.h>
#include <util/dstr.h>
#include <string.h>

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("simple-streamer", "en-US")

MODULE_EXPORT const char *obs_module_description(void)
{
	return "Simple Streamer Native Multi-Stream Output";
}

MODULE_EXPORT const char *obs_module_name(void)
{
	return "Simple Streamer Multi-Output";
}

#define MAX_SECONDARY_OUTPUTS 16

struct secondary_target {
	char id[64];
	char name[128];
	obs_output_t *output;
	obs_service_t *service;
	bool running;
};

static struct secondary_target sec_targets[MAX_SECONDARY_OUTPUTS];
static size_t num_sec_targets = 0;

static void on_secondary_stop(void *data, calldata_t *cd)
{
	struct secondary_target *target = (struct secondary_target *)data;
	int code = (int)calldata_int(cd, "code");
	if (code == OBS_OUTPUT_SUCCESS) {
		blog(LOG_INFO, "[SimpleStreamer] Output '%s' (%s) completed cleanly.", target->name, target->id);
	} else {
		blog(LOG_WARNING, "[SimpleStreamer] Output '%s' (%s) stopped with code: %d", target->name, target->id, code);
	}
	target->running = false;
}

static void release_all_secondary_outputs(void)
{
	for (size_t i = 0; i < num_sec_targets; i++) {
		struct secondary_target *t = &sec_targets[i];
		if (t->output) {
			if (obs_output_active(t->output)) {
				obs_output_stop(t->output);
			}
			obs_output_release(t->output);
			t->output = NULL;
		}
		if (t->service) {
			obs_service_release(t->service);
			t->service = NULL;
		}
		t->running = false;
	}
	num_sec_targets = 0;
	blog(LOG_INFO, "[SimpleStreamer] Cleaned up previous secondary outputs.");
}

static void stop_all_secondary_outputs(void)
{
	for (size_t i = 0; i < num_sec_targets; i++) {
		struct secondary_target *t = &sec_targets[i];
		if (t->output) {
			if (obs_output_active(t->output)) {
				blog(LOG_INFO, "[SimpleStreamer] Requesting stop for output: %s", t->name);
				obs_output_stop(t->output);
			}
		}
		t->running = false;
	}
	blog(LOG_INFO, "[SimpleStreamer] Sent stop signal to all secondary outputs.");
}

static inline bool is_target_enabled(obs_data_t *item)
{
	if (!item) return false;
	if (obs_data_get_bool(item, "enabled")) return true;
	if (obs_data_get_int(item, "enabled") > 0) return true;
	return false;
}

static void start_single_secondary_target(const char *id, const char *name, const char *server, const char *key, obs_encoder_t *venc, obs_encoder_t *aenc)
{
	if (num_sec_targets >= MAX_SECONDARY_OUTPUTS) {
		blog(LOG_WARNING, "[SimpleStreamer] Max secondary outputs reached (%d)", MAX_SECONDARY_OUTPUTS);
		return;
	}

	char out_name[128];
	snprintf(out_name, sizeof(out_name), "simple_streamer_out_%s", id);

	char svc_name[128];
	snprintf(svc_name, sizeof(svc_name), "simple_streamer_svc_%s", id);

	// 1. Service
	obs_data_t *s_settings = obs_data_create();
	obs_data_set_string(s_settings, "server", server);
	obs_data_set_string(s_settings, "key", key);
	obs_data_set_bool(s_settings, "use_auth", false);

	obs_service_t *svc = obs_service_create("rtmp_custom", svc_name, s_settings, NULL);
	obs_data_release(s_settings);

	if (!svc) {
		blog(LOG_ERROR, "[SimpleStreamer] Failed to create rtmp_custom service for %s", id);
		return;
	}

	// 2. Output
	obs_output_t *out = obs_output_create("rtmp_output", out_name, NULL, NULL);
	if (!out) {
		blog(LOG_ERROR, "[SimpleStreamer] Failed to create rtmp_output for %s (%s)", id, out_name);
		obs_service_release(svc);
		return;
	}

	obs_output_set_service(out, svc);
	obs_output_set_video_encoder(out, venc);
	obs_output_set_audio_encoder(out, aenc, 0);

	struct secondary_target *target = &sec_targets[num_sec_targets];
	snprintf(target->id, sizeof(target->id), "%s", id);
	snprintf(target->name, sizeof(target->name), "%s", name);
	target->output = out;
	target->service = svc;
	target->running = false;

	signal_handler_t *sh = obs_output_get_signal_handler(out);
	if (sh) {
		signal_handler_connect(sh, "stop", on_secondary_stop, target);
	}

	if (obs_output_start(out)) {
		target->running = true;
		blog(LOG_INFO, "[SimpleStreamer] ✓ Started secondary output [%s] to %s", out_name, server);
		num_sec_targets++;
	} else {
		const char *err = obs_output_get_last_error(out);
		blog(LOG_ERROR, "[SimpleStreamer] Failed to start output %s: %s", out_name, err ? err : "Unknown");
		obs_output_release(out);
		obs_service_release(svc);
		target->output = NULL;
		target->service = NULL;
	}
}

static void start_all_secondary_outputs(void)
{
	release_all_secondary_outputs();

	char *cfg_path = obs_module_config_path("config.json");
	if (!cfg_path) {
		blog(LOG_WARNING, "[SimpleStreamer] Unable to determine config path.");
		return;
	}

	obs_data_t *cfg = obs_data_create_from_json_file(cfg_path);
	if (!cfg) {
		bfree(cfg_path);
		blog(LOG_INFO, "[SimpleStreamer] No config.json found. Skipping secondary streams.");
		return;
	}

	// Guard: Only start secondary outputs if explicitly armed by the Simple Streamer app/dock.
	// If the user started streaming via the native OBS button or another plugin, secondary outputs must not start.
	bool armed = obs_data_get_bool(cfg, "armed");
	if (!armed) {
		blog(LOG_INFO, "[SimpleStreamer] Stream started independently (OBS button/other). Secondary outputs not armed (skipping).");
		obs_data_release(cfg);
		bfree(cfg_path);
		return;
	}

	// Disarm immediately so subsequent stream starts will not auto-trigger secondary outputs
	obs_data_set_bool(cfg, "armed", false);
	obs_data_save_json_safe(cfg, cfg_path, "tmp", "bak");
	bfree(cfg_path);

	obs_output_t *main_out = obs_frontend_get_streaming_output();
	if (!main_out) {
		blog(LOG_ERROR, "[SimpleStreamer] Main streaming output is unavailable.");
		obs_data_release(cfg);
		return;
	}

	obs_encoder_t *venc = obs_output_get_video_encoder(main_out);
	obs_encoder_t *aenc = obs_output_get_audio_encoder(main_out, 0);

	// Detect primary stream server URL to prevent duplicate streaming conflicts
	char main_server[512] = {0};
	obs_service_t *main_svc = obs_output_get_service(main_out);
	if (main_svc) {
		obs_data_t *svc_settings = obs_service_get_settings(main_svc);
		if (svc_settings) {
			const char *srv = obs_data_get_string(svc_settings, "server");
			if (srv && *srv) {
				snprintf(main_server, sizeof(main_server), "%s", srv);
			}
			obs_data_release(svc_settings);
		}
	}
	obs_output_release(main_out);

	if (!venc || !aenc) {
		blog(LOG_ERROR, "[SimpleStreamer] Main OBS encoders are unavailable.");
		obs_data_release(cfg);
		return;
	}

	obs_data_array_t *outputs_array = obs_data_get_array(cfg, "outputs");
	if (outputs_array) {
		size_t count = obs_data_array_count(outputs_array);
		blog(LOG_INFO, "[SimpleStreamer] Loading %zu secondary output targets from config...", count);

		for (size_t i = 0; i < count; i++) {
			obs_data_t *item = obs_data_array_item(outputs_array, i);
			bool enabled = is_target_enabled(item);
			const char *id = obs_data_get_string(item, "id");
			const char *name = obs_data_get_string(item, "name");
			const char *server = obs_data_get_string(item, "server");
			const char *key = obs_data_get_string(item, "key");

			if (enabled && server && *server && key && *key) {
				// Check for collision with primary stream
				if (main_server[0] && strstr(server, main_server) != NULL) {
					blog(LOG_WARNING, "[SimpleStreamer] Output '%s' matches primary stream destination (%s). Skipping duplicate.", name, server);
				} else {
					start_single_secondary_target(id, name, server, key, venc, aenc);
				}
			}
			obs_data_release(item);
		}
		obs_data_array_release(outputs_array);
	} else {
		// Fallback to legacy single-secondary format
		bool enabled = is_target_enabled(cfg);
		const char *server = obs_data_get_string(cfg, "server");
		const char *key = obs_data_get_string(cfg, "key");

		if (enabled && server && *server && key && *key) {
			if (main_server[0] && strstr(server, main_server) != NULL) {
				blog(LOG_WARNING, "[SimpleStreamer] Legacy target matches primary stream destination (%s). Skipping duplicate.", server);
			} else {
				start_single_secondary_target("legacy", "Secondary RTMP", server, key, venc, aenc);
			}
		}
	}

	obs_data_release(cfg);
}

static void on_frontend_event(enum obs_frontend_event event, void *private_data)
{
	UNUSED_PARAMETER(private_data);
	switch (event) {
	case OBS_FRONTEND_EVENT_STREAMING_STARTED:
		blog(LOG_INFO, "[SimpleStreamer] Main stream started -> starting secondary outputs.");
		start_all_secondary_outputs();
		break;
	case OBS_FRONTEND_EVENT_STREAMING_STOPPED:
		blog(LOG_INFO, "[SimpleStreamer] Main stream stopped -> terminating secondary outputs.");
		stop_all_secondary_outputs();
		break;
	default:
		break;
	}
}

static void open_mobile_remote_action(void *data)
{
	UNUSED_PARAMETER(data);
#if defined(__APPLE__)
	system("/usr/bin/open 'http://127.0.0.1:45455/remote' &");
#elif defined(_WIN32)
	system("start \"\" \"http://127.0.0.1:45455/remote\"");
#else
	system("xdg-open 'http://127.0.0.1:45455/remote' &");
#endif
}

static void open_studio_dock_action(void *data)
{
	UNUSED_PARAMETER(data);
#if defined(__APPLE__)
	system("/usr/bin/open 'http://127.0.0.1:45455/dock' &");
#elif defined(_WIN32)
	system("start \"\" \"http://127.0.0.1:45455/dock\"");
#else
	system("xdg-open 'http://127.0.0.1:45455/dock' &");
#endif
}

bool obs_module_load(void)
{
	blog(LOG_INFO, "[SimpleStreamer] Multi-Output Plugin loaded (version 2.2.0)");
	obs_frontend_add_event_callback(on_frontend_event, NULL);
	obs_frontend_add_tools_menu_item("Simple Streamer: Open Mobile Remote", open_mobile_remote_action, NULL);
	obs_frontend_add_tools_menu_item("Simple Streamer: Open Studio Dock", open_studio_dock_action, NULL);
	return true;
}

void obs_module_unload(void)
{
	obs_frontend_remove_event_callback(on_frontend_event, NULL);
	release_all_secondary_outputs();
	blog(LOG_INFO, "[SimpleStreamer] Multi-Output Plugin unloaded");
}
