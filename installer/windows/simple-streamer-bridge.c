/*
 * Simple Streamer — Native Windows Background Bridge (Winsock2 + WinHTTP + CNG)
 * Compiled statically (/MT) with zero external runtime dependencies.
 * Replaces legacy PowerShell HttpListener script to eliminate AV heuristics
 * and Windows non-admin URL ACL failures.
 */

#define WIN32_LEAN_AND_MEAN
#define _CRT_SECURE_NO_WARNINGS

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <winhttp.h>
#include <bcrypt.h>
#include <iphlpapi.h>
#include <objbase.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "ole32.lib")

#define BRIDGE_PORT 45455
#define DISCOVER_PORT 45456
#define MAX_REQ_BYTES (4 * 1024 * 1024)

static CRITICAL_SECTION g_state_lock;
static char g_bridge_dir[MAX_PATH];
static char g_obs_plugin_dir[MAX_PATH];
static char g_obs_dir[MAX_PATH];
static ULONGLONG g_last_remote_sync_ms = 0;

/* ---------- String & Path Helpers ---------- */

static void ensure_dir_utf8(const char *path) {
    WCHAR wpath[MAX_PATH];
    if (!MultiByteToWideChar(CP_UTF8, 0, path, -1, wpath, MAX_PATH)) return;
    WCHAR tmp[MAX_PATH];
    wcscpy(tmp, wpath);
    for (WCHAR *p = tmp + 1; *p; p++) {
        if (*p == L'\\' || *p == L'/') {
            WCHAR c = *p;
            *p = 0;
            CreateDirectoryW(tmp, NULL);
            *p = c;
        }
    }
    CreateDirectoryW(tmp, NULL);
}

static char *read_file_alloc(const char *path, size_t *out_len) {
    WCHAR wpath[MAX_PATH];
    if (!MultiByteToWideChar(CP_UTF8, 0, path, -1, wpath, MAX_PATH)) return NULL;
    HANDLE h = CreateFileW(wpath, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return NULL;
    LARGE_INTEGER sz;
    if (!GetFileSizeEx(h, &sz) || sz.QuadPart > 16 * 1024 * 1024) {
        CloseHandle(h);
        return NULL;
    }
    DWORD len = (DWORD)sz.QuadPart;
    char *buf = (char *)malloc((size_t)len + 1);
    if (!buf) { CloseHandle(h); return NULL; }
    DWORD read = 0;
    BOOL ok = ReadFile(h, buf, len, &read, NULL);
    CloseHandle(h);
    if (!ok) { free(buf); return NULL; }
    buf[read] = '\0';
    /* Strip UTF-8 BOM if present */
    if (read >= 3 && (unsigned char)buf[0] == 0xEF && (unsigned char)buf[1] == 0xBB && (unsigned char)buf[2] == 0xBF) {
        memmove(buf, buf + 3, read - 3 + 1);
        read -= 3;
    }
    if (out_len) *out_len = (size_t)read;
    return buf;
}

static BOOL write_file_utf8(const char *path, const char *data, size_t len) {
    WCHAR wpath[MAX_PATH];
    if (!MultiByteToWideChar(CP_UTF8, 0, path, -1, wpath, MAX_PATH)) return FALSE;
    HANDLE h = CreateFileW(wpath, GENERIC_WRITE, FILE_SHARE_READ, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return FALSE;
    DWORD written = 0;
    BOOL ok = WriteFile(h, data, (DWORD)len, &written, NULL);
    CloseHandle(h);
    return ok && written == (DWORD)len;
}

static BOOL file_exists_utf8(const char *path) {
    WCHAR wpath[MAX_PATH];
    if (!MultiByteToWideChar(CP_UTF8, 0, path, -1, wpath, MAX_PATH)) return FALSE;
    DWORD attr = GetFileAttributesW(wpath);
    return (attr != INVALID_FILE_ATTRIBUTES) && !(attr & FILE_ATTRIBUTE_DIRECTORY);
}

static void url_decode(const char *src, char *dst, size_t dst_sz) {
    size_t i = 0;
    while (*src && i + 1 < dst_sz) {
        if (*src == '%' && isxdigit((unsigned char)src[1]) && isxdigit((unsigned char)src[2])) {
            char hex[3] = { src[1], src[2], 0 };
            dst[i++] = (char)strtol(hex, NULL, 16);
            src += 3;
        } else if (*src == '+') {
            dst[i++] = ' ';
            src++;
        } else {
            dst[i++] = *src++;
        }
    }
    dst[i] = '\0';
}

static void get_query_param(const char *query, const char *key, char *out, size_t out_sz) {
    out[0] = '\0';
    if (!query || !*query) return;
    size_t klen = strlen(key);
    const char *p = query;
    while (*p) {
        const char *amp = strchr(p, '&');
        size_t plen = amp ? (size_t)(amp - p) : strlen(p);
        const char *eq = memchr(p, '=', plen);
        if (eq && (size_t)(eq - p) == klen && _strnicmp(p, key, klen) == 0) {
            size_t vlen = plen - klen - 1;
            char *tmp = (char *)malloc(vlen + 1);
            if (tmp) {
                memcpy(tmp, eq + 1, vlen);
                tmp[vlen] = '\0';
                url_decode(tmp, out, out_sz);
                free(tmp);
            }
            return;
        }
        if (!amp) break;
        p = amp + 1;
    }
}

static void json_escape_append(const char *src, char **buf, size_t *len, size_t *cap) {
    if (!src) src = "";
    for (const unsigned char *p = (const unsigned char *)src; *p; p++) {
        char esc[8];
        const char *add = NULL;
        size_t alen = 0;
        if (*p == '"') { add = "\\\""; alen = 2; }
        else if (*p == '\\') { add = "\\\\"; alen = 2; }
        else if (*p == '\b') { add = "\\b"; alen = 2; }
        else if (*p == '\f') { add = "\\f"; alen = 2; }
        else if (*p == '\n') { add = "\\n"; alen = 2; }
        else if (*p == '\r') { add = "\\r"; alen = 2; }
        else if (*p == '\t') { add = "\\t"; alen = 2; }
        else if (*p < 0x20) {
            sprintf(esc, "\\u%04x", *p);
            add = esc; alen = 6;
        } else {
            esc[0] = (char)*p;
            add = esc; alen = 1;
        }
        if (*len + alen + 1 >= *cap) {
            *cap = (*cap + alen + 256) * 2;
            *buf = (char *)realloc(*buf, *cap);
        }
        memcpy(*buf + *len, add, alen);
        *len += alen;
    }
    (*buf)[*len] = '\0';
}

/* Extract a JSON string value for a given top-level/simple key */
static BOOL json_extract_string(const char *json, const char *key, char *out, size_t out_sz) {
    out[0] = '\0';
    if (!json || !key) return FALSE;
    char pat[128];
    snprintf(pat, sizeof(pat), "\"%s\"", key);
    const char *p = json;
    while ((p = strstr(p, pat)) != NULL) {
        const char *q = p + strlen(pat);
        while (*q && isspace((unsigned char)*q)) q++;
        if (*q != ':') { p += strlen(pat); continue; }
        q++;
        while (*q && isspace((unsigned char)*q)) q++;
        if (*q != '"') return FALSE;
        q++;
        size_t i = 0;
        while (*q && *q != '"' && i + 1 < out_sz) {
            if (*q == '\\' && q[1]) {
                q++;
                if (*q == 'n') out[i++] = '\n';
                else if (*q == 'r') out[i++] = '\r';
                else if (*q == 't') out[i++] = '\t';
                else if (*q == 'u' && isxdigit((unsigned char)q[1]) && isxdigit((unsigned char)q[2]) && isxdigit((unsigned char)q[3]) && isxdigit((unsigned char)q[4])) {
                    char hex[5] = { q[1], q[2], q[3], q[4], 0 };
                    unsigned int cp = (unsigned int)strtoul(hex, NULL, 16);
                    if (cp < 0x80) out[i++] = (char)cp;
                    else if (cp < 0x800 && i + 2 < out_sz) {
                        out[i++] = (char)(0xC0 | (cp >> 6));
                        out[i++] = (char)(0x80 | (cp & 0x3F));
                    } else if (i + 3 < out_sz) {
                        out[i++] = (char)(0xE0 | (cp >> 12));
                        out[i++] = (char)(0x80 | ((cp >> 6) & 0x3F));
                        out[i++] = (char)(0x80 | (cp & 0x3F));
                    }
                    q += 4;
                } else {
                    out[i++] = *q;
                }
            } else {
                out[i++] = *q;
            }
            q++;
        }
        out[i] = '\0';
        return TRUE;
    }
    return FALSE;
}

static BOOL json_extract_int(const char *json, const char *key, int *out_val) {
    if (!json || !key) return FALSE;
    char pat[128];
    snprintf(pat, sizeof(pat), "\"%s\"", key);
    const char *p = strstr(json, pat);
    if (!p) return FALSE;
    p += strlen(pat);
    while (*p && isspace((unsigned char)*p)) p++;
    if (*p != ':') return FALSE;
    p++;
    while (*p && isspace((unsigned char)*p)) p++;
    if (!isdigit((unsigned char)*p) && *p != '-') return FALSE;
    *out_val = atoi(p);
    return TRUE;
}

/* Extract a JSON array substring "[...]" for a key */
static char *json_extract_array_alloc(const char *json, const char *key) {
    if (!json || !key) return NULL;
    char pat[128];
    snprintf(pat, sizeof(pat), "\"%s\"", key);
    const char *p = strstr(json, pat);
    if (!p) return NULL;
    p += strlen(pat);
    while (*p && isspace((unsigned char)*p)) p++;
    if (*p != ':') return NULL;
    p++;
    while (*p && isspace((unsigned char)*p)) p++;
    if (*p != '[') return NULL;
    int depth = 0, in_str = 0;
    const char *start = p;
    while (*p) {
        if (*p == '"' && (p == start || p[-1] != '\\')) in_str = !in_str;
        else if (!in_str) {
            if (*p == '[') depth++;
            else if (*p == ']') {
                depth--;
                if (depth == 0) {
                    size_t len = (size_t)(p - start + 1);
                    char *res = (char *)malloc(len + 1);
                    if (res) { memcpy(res, start, len); res[len] = '\0'; }
                    return res;
                }
            }
        }
        p++;
    }
    return NULL;
}

/* ---------- Crypto & Network Helpers ---------- */

static void base64_encode(const unsigned char *in, size_t len, char *out, size_t out_sz) {
    static const char tbl[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    size_t i = 0, j = 0;
    while (i < len && j + 4 < out_sz) {
        unsigned int a = in[i++];
        unsigned int b = (i < len) ? in[i++] : 0;
        unsigned int c = (i < len) ? in[i++] : 0;
        unsigned int triple = (a << 16) | (b << 8) | c;
        size_t rem = (i > len) ? 0 : 0; /* handled below */
        (void)rem;
        out[j++] = tbl[(triple >> 18) & 0x3F];
        out[j++] = tbl[(triple >> 12) & 0x3F];
        out[j++] = tbl[(triple >> 6) & 0x3F];
        out[j++] = tbl[triple & 0x3F];
    }
    if (len % 3 == 1 && j >= 2) { out[j - 1] = '='; out[j - 2] = '='; }
    else if (len % 3 == 2 && j >= 1) { out[j - 1] = '='; }
    out[j] = '\0';
}

static BOOL sha256_bytes(const char *data, size_t len, unsigned char out[32]) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;
    BOOL ok = FALSE;
    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0) == 0) {
        if (BCryptCreateHash(hAlg, &hHash, NULL, 0, NULL, 0, 0) == 0) {
            if (BCryptHashData(hHash, (PUCHAR)data, (ULONG)len, 0) == 0) {
                if (BCryptFinishHash(hHash, out, 32, 0) == 0) ok = TRUE;
            }
            BCryptDestroyHash(hHash);
        }
        BCryptCloseAlgorithmProvider(hAlg, 0);
    }
    return ok;
}

static BOOL is_tcp_port_open(const char *ip, int port, int timeout_ms) {
    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) return FALSE;
    u_long mode = 1;
    ioctlsocket(s, FIONBIO, &mode);
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((u_short)port);
    inet_pton(AF_INET, ip, &addr.sin_addr);
    connect(s, (struct sockaddr *)&addr, sizeof(addr));
    fd_set wfds;
    FD_ZERO(&wfds);
    FD_SET(s, &wfds);
    struct timeval tv;
    tv.tv_sec = timeout_ms / 1000;
    tv.tv_usec = (timeout_ms % 1000) * 1000;
    BOOL alive = FALSE;
    if (select(0, NULL, &wfds, NULL, &tv) > 0) {
        int err = 0, elen = sizeof(err);
        if (getsockopt(s, SOL_SOCKET, SO_ERROR, (char *)&err, &elen) == 0 && err == 0) {
            alive = TRUE;
        }
    }
    closesocket(s);
    return alive;
}

static void get_lan_ipv4(char *out, size_t out_sz) {
    strcpy(out, "127.0.0.1");
    SOCKET s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (s == INVALID_SOCKET) return;
    struct sockaddr_in remote, local;
    memset(&remote, 0, sizeof(remote));
    remote.sin_family = AF_INET;
    remote.sin_port = htons(53);
    inet_pton(AF_INET, "8.8.8.8", &remote.sin_addr);
    if (connect(s, (struct sockaddr *)&remote, sizeof(remote)) == 0) {
        int llen = sizeof(local);
        if (getsockname(s, (struct sockaddr *)&local, &llen) == 0) {
            char buf[64];
            if (inet_ntop(AF_INET, &local.sin_addr, buf, sizeof(buf))) {
                if (strncmp(buf, "127.", 4) != 0 && strncmp(buf, "169.254.", 8) != 0) {
                    strncpy(out, buf, out_sz - 1);
                    out[out_sz - 1] = '\0';
                }
            }
        }
    }
    closesocket(s);
}

static void get_env_utf8(const WCHAR *name, char *out, size_t out_sz, const char *fallback) {
    WCHAR wbuf[MAX_PATH];
    DWORD n = GetEnvironmentVariableW(name, wbuf, MAX_PATH);
    if (n > 0 && n < MAX_PATH) {
        if (WideCharToMultiByte(CP_UTF8, 0, wbuf, -1, out, (int)out_sz, NULL, NULL) > 0) return;
    }
    strncpy(out, fallback, out_sz - 1);
    out[out_sz - 1] = '\0';
}

/* Update "enabled":true/false for an item matching id/name/platform inside a JSON array string */
static char *update_dest_enabled_in_json(const char *dests_json, const char *target_id, int force_state /* -1 = toggle, 0 = false, 1 = true */) {
    if (!dests_json || !target_id || !*target_id) return NULL;
    char *res = _strdup(dests_json);
    if (!res) return NULL;
    char needle[256];
    snprintf(needle, sizeof(needle), "\"%s\"", target_id);
    const char *hit = strstr(res, needle);
    if (!hit) { free(res); return NULL; }

    /* Find enclosing { ... } object bounds */
    const char *obj_start = hit;
    while (obj_start > res && *obj_start != '{') obj_start--;
    const char *obj_end = strchr(hit, '}');
    if (*obj_start != '{' || !obj_end) { free(res); return NULL; }

    const char *en_key = strstr(obj_start, "\"enabled\"");
    if (!en_key || en_key > obj_end) { free(res); return NULL; }
    const char *colon = strchr(en_key + 9, ':');
    if (!colon || colon > obj_end) { free(res); return NULL; }
    const char *val = colon + 1;
    while (val < obj_end && isspace((unsigned char)*val)) val++;

    BOOL cur_en = (_strnicmp(val, "true", 4) == 0);
    size_t old_len = cur_en ? 4 : (_strnicmp(val, "false", 5) == 0 ? 5 : 0);
    if (old_len == 0) { free(res); return NULL; }

    BOOL next_en = (force_state == -1) ? !cur_en : (force_state != 0);
    const char *rep = next_en ? "true" : "false";
    size_t rep_len = strlen(rep);
    size_t prefix = (size_t)(val - res);
    size_t suffix_len = strlen(val + old_len);
    char *out = (char *)malloc(prefix + rep_len + suffix_len + 1);
    if (!out) { free(res); return NULL; }
    memcpy(out, res, prefix);
    memcpy(out + prefix, rep, rep_len);
    memcpy(out + prefix + rep_len, val + old_len, suffix_len + 1);
    free(res);
    return out;
}

static void get_obs_ws_config(char *pass_out, size_t pass_sz, int *port_out) {
    pass_out[0] = '\0';
    *port_out = 4455;
    char path[MAX_PATH];
    snprintf(path, sizeof(path), "%s\\global.ini", g_obs_dir);
    size_t len = 0;
    char *txt = read_file_alloc(path, &len);
    if (txt) {
        char *p = strstr(txt, "ServerPassword=");
        if (p) {
            p += 15;
            char *eol = strpbrk(p, "\r\n");
            size_t plen = eol ? (size_t)(eol - p) : strlen(p);
            if (plen >= pass_sz) plen = pass_sz - 1;
            memcpy(pass_out, p, plen);
            pass_out[plen] = '\0';
        }
        char *sp = strstr(txt, "ServerPort=");
        if (sp) {
            int pv = atoi(sp + 11);
            if (pv > 0 && pv < 65536) *port_out = pv;
        }
        free(txt);
    }
    if (!pass_out[0]) {
        snprintf(path, sizeof(path), "%s\\plugin_config\\obs-websocket\\config.json", g_obs_dir);
        char *j = read_file_alloc(path, &len);
        if (j) {
            json_extract_string(j, "server_password", pass_out, pass_sz);
            int pv = 0;
            if (json_extract_int(j, "server_port", &pv) && pv > 0 && pv < 65536) *port_out = pv;
            free(j);
        }
    }
}

static void get_or_create_machine_id(char *out, size_t out_sz) {
    char mid_path[MAX_PATH];
    snprintf(mid_path, sizeof(mid_path), "%s\\machine_id.txt", g_obs_plugin_dir);
    size_t len = 0;
    char *txt = read_file_alloc(mid_path, &len);
    if (txt) {
        char *s = txt;
        while (*s && isspace((unsigned char)*s)) s++;
        size_t sl = strlen(s);
        while (sl > 0 && isspace((unsigned char)s[sl - 1])) s[--sl] = '\0';
        if (sl >= 8) {
            strncpy(out, s, out_sz - 1);
            out[out_sz - 1] = '\0';
            free(txt);
            return;
        }
        free(txt);
    }
    out[0] = '\0';
    HKEY hk = NULL;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Cryptography", 0, KEY_READ | KEY_WOW64_64KEY, &hk) == ERROR_SUCCESS) {
        DWORD sz = (DWORD)out_sz, type = 0;
        if (RegQueryValueExA(hk, "MachineGuid", NULL, &type, (LPBYTE)out, &sz) != ERROR_SUCCESS) out[0] = '\0';
        RegCloseKey(hk);
    }
    if (strlen(out) < 8) {
        GUID g;
        if (CoCreateGuid(&g) == S_OK) {
            snprintf(out, out_sz, "%08lx-%04x-%04x-%02x%02x-%02x%02x%02x%02x%02x%02x",
                g.Data1, g.Data2, g.Data3,
                g.Data4[0], g.Data4[1], g.Data4[2], g.Data4[3],
                g.Data4[4], g.Data4[5], g.Data4[6], g.Data4[7]);
        } else {
            strcpy(out, "win-default-station");
        }
    }
    ensure_dir_utf8(g_obs_plugin_dir);
    write_file_utf8(mid_path, out, strlen(out));
}

/* ---------- Broadcast State Helpers ---------- */

static void load_broadcast_state(char *title, size_t t_sz, char *desc, size_t d_sz, char **dests_json_alloc) {
    title[0] = '\0';
    desc[0] = '\0';
    *dests_json_alloc = _strdup("[]");

    char bfile[MAX_PATH];
    snprintf(bfile, sizeof(bfile), "%s\\broadcast_state.json", g_obs_plugin_dir);
    size_t len = 0;
    char *raw = read_file_alloc(bfile, &len);
    if (!raw) return;

    char tmp[4096];
    if (json_extract_string(raw, "title", tmp, sizeof(tmp))) {
        strncpy(title, tmp, t_sz - 1);
        title[t_sz - 1] = '\0';
    }
    if (json_extract_string(raw, "description", tmp, sizeof(tmp))) {
        strncpy(desc, tmp, d_sz - 1);
        desc[d_sz - 1] = '\0';
    }
    char *arr = json_extract_array_alloc(raw, "destinations");
    if (arr) {
        free(*dests_json_alloc);
        *dests_json_alloc = arr;
    }
    free(raw);
}

static void save_broadcast_state(const char *title, const char *desc, const char *dests_json) {
    ensure_dir_utf8(g_obs_plugin_dir);
    char bfile[MAX_PATH];
    snprintf(bfile, sizeof(bfile), "%s\\broadcast_state.json", g_obs_plugin_dir);

    size_t cap = 4096 + strlen(dests_json ? dests_json : "[]");
    size_t len = 0;
    char *buf = (char *)malloc(cap);
    if (!buf) return;
    buf[0] = '\0';

    const char *p1 = "{\"title\":\"";
    memcpy(buf, p1, strlen(p1)); len = strlen(p1);
    json_escape_append(title, &buf, &len, &cap);

    const char *p2 = "\",\"description\":\"";
    if (len + strlen(p2) + 1 >= cap) { cap *= 2; buf = (char *)realloc(buf, cap); }
    memcpy(buf + len, p2, strlen(p2)); len += strlen(p2);
    json_escape_append(desc, &buf, &len, &cap);

    const char *p3 = "\",\"destinations\":";
    const char *dj = (dests_json && *dests_json) ? dests_json : "[]";
    size_t extra = strlen(p3) + strlen(dj) + 4;
    if (len + extra >= cap) { cap += extra + 256; buf = (char *)realloc(buf, cap); }
    memcpy(buf + len, p3, strlen(p3)); len += strlen(p3);
    memcpy(buf + len, dj, strlen(dj)); len += strlen(dj);
    buf[len++] = '}';
    buf[len] = '\0';

    write_file_utf8(bfile, buf, len);
    free(buf);
}

/* ---------- Evergreen Cloud Remote Sync ---------- */

static void sync_remote_from_cloud_if_stale(const char *local_path) {
    ULONGLONG now = GetTickCount64();
    if (g_last_remote_sync_ms != 0 && (now - g_last_remote_sync_ms) < 300000ULL) return;
    g_last_remote_sync_ms = now;

    HINTERNET hSession = WinHttpOpen(L"SimpleStreamerBridge/2.2", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return;
    WinHttpSetTimeouts(hSession, 2000, 2000, 2000, 4000);
    HINTERNET hConnect = WinHttpConnect(hSession, L"simple-streamer.bdjlmn.com", INTERNET_DEFAULT_HTTPS_PORT, 0);
    if (hConnect) {
        HINTERNET hReq = WinHttpOpenRequest(hConnect, L"GET", L"/remote.html", NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE);
        if (hReq) {
            if (WinHttpSendRequest(hReq, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) && WinHttpReceiveResponse(hReq, NULL)) {
                DWORD status = 0, ssz = sizeof(status);
                WinHttpQueryHeaders(hReq, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, NULL, &status, &ssz, NULL);
                if (status == 200) {
                    size_t cap = 262144, len = 0;
                    char *html = (char *)malloc(cap);
                    DWORD avail = 0;
                    while (html && WinHttpQueryDataAvailable(hReq, &avail) && avail > 0) {
                        if (len + avail + 1 >= cap) {
                            cap = (cap + avail) * 2;
                            html = (char *)realloc(html, cap);
                        }
                        if (!html) break;
                        DWORD rd = 0;
                        if (!WinHttpReadData(hReq, html + len, avail, &rd) || rd == 0) break;
                        len += rd;
                    }
                    if (html) {
                        html[len] = '\0';
                        if (strstr(html, "<html") && strstr(html, "SIMPLE STREAMER")) {
                            ensure_dir_utf8(g_bridge_dir);
                            write_file_utf8(local_path, html, len);
                            char obs_rem[MAX_PATH];
                            snprintf(obs_rem, sizeof(obs_rem), "%s\\remote.html", g_obs_plugin_dir);
                            ensure_dir_utf8(g_obs_plugin_dir);
                            write_file_utf8(obs_rem, html, len);
                        }
                        free(html);
                    }
                }
            }
            WinHttpCloseHandle(hReq);
        }
        WinHttpCloseHandle(hConnect);
    }
    WinHttpCloseHandle(hSession);
}

/* ---------- Window Focus Helper ---------- */

static BOOL CALLBACK enum_obs_window_cb(HWND hwnd, LPARAM lParam) {
    if (!IsWindowVisible(hwnd)) return TRUE;
    char title[256];
    if (GetWindowTextA(hwnd, title, sizeof(title)) > 0) {
        if (strstr(title, "OBS") != NULL) {
            if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);
            *(BOOL *)lParam = TRUE;
            return FALSE;
        }
    }
    return TRUE;
}

static void focus_obs_window(void) {
    BOOL found = FALSE;
    EnumWindows(enum_obs_window_cb, (LPARAM)&found);
}

/* ---------- HTTP Response Helper ---------- */

static void send_http(SOCKET s, int code, const char *status_text, const char *ctype, const char *extra_hdrs, const char *body, size_t body_len) {
    char hdr[1024];
    int hlen = snprintf(hdr, sizeof(hdr),
        "HTTP/1.1 %d %s\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Private-Network: true\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: *\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "%s\r\n",
        code, status_text, ctype, body_len, extra_hdrs ? extra_hdrs : "");
    send(s, hdr, hlen, 0);
    if (body && body_len > 0) {
        size_t sent = 0;
        while (sent < body_len) {
            int n = send(s, body + sent, (int)(body_len - sent), 0);
            if (n <= 0) break;
            sent += (size_t)n;
        }
    }
}

static const char *mime_from_path(const char *path) {
    const char *ext = strrchr(path, '.');
    if (!ext) return "application/octet-stream";
    if (_stricmp(ext, ".html") == 0) return "text/html; charset=utf-8";
    if (_stricmp(ext, ".js") == 0) return "application/javascript; charset=utf-8";
    if (_stricmp(ext, ".css") == 0) return "text/css; charset=utf-8";
    if (_stricmp(ext, ".svg") == 0) return "image/svg+xml";
    if (_stricmp(ext, ".png") == 0) return "image/png";
    if (_stricmp(ext, ".jpg") == 0 || _stricmp(ext, ".jpeg") == 0) return "image/jpeg";
    if (_stricmp(ext, ".json") == 0) return "application/json; charset=utf-8";
    return "application/octet-stream";
}

/* ---------- HTTP Request Handler ---------- */

static void handle_http_client(SOCKET c) {
    DWORD rcv_to = 5000;
    setsockopt(c, SOL_SOCKET, SO_RCVTIMEO, (const char *)&rcv_to, sizeof(rcv_to));

    size_t cap = 65536, total = 0;
    char *buf = (char *)malloc(cap);
    if (!buf) { closesocket(c); return; }

    char *hdr_end = NULL;
    size_t content_length = 0;
    while (total < MAX_REQ_BYTES) {
        if (total + 4096 >= cap) {
            cap *= 2;
            char *nb = (char *)realloc(buf, cap);
            if (!nb) { free(buf); closesocket(c); return; }
            buf = nb;
        }
        int n = recv(c, buf + total, (int)(cap - total - 1), 0);
        if (n <= 0) break;
        total += (size_t)n;
        buf[total] = '\0';
        if (!hdr_end) {
            hdr_end = strstr(buf, "\r\n\r\n");
            if (hdr_end) {
                char *cl = NULL;
                for (char *p = buf; p < hdr_end; p++) {
                    if (_strnicmp(p, "Content-Length:", 15) == 0 && (p == buf || p[-1] == '\n')) {
                        cl = p + 15;
                        break;
                    }
                }
                if (cl) content_length = (size_t)strtoul(cl, NULL, 10);
            }
        }
        if (hdr_end) {
            size_t hdr_bytes = (size_t)(hdr_end - buf) + 4;
            if (total >= hdr_bytes + content_length) break;
        }
    }

    if (!hdr_end) { free(buf); closesocket(c); return; }
    char *body = hdr_end + 4;
    size_t body_len = total - (size_t)(body - buf);
    *hdr_end = '\0';

    char method[16] = {0}, raw_url[4096] = {0};
    sscanf(buf, "%15s %4095s", method, raw_url);

    if (_stricmp(method, "OPTIONS") == 0) {
        send_http(c, 200, "OK", "text/plain", NULL, "", 0);
        free(buf); closesocket(c); return;
    }

    char path[2048] = {0}, query[2048] = {0};
    char *qmark = strchr(raw_url, '?');
    if (qmark) {
        size_t plen = (size_t)(qmark - raw_url);
        if (plen >= sizeof(path)) plen = sizeof(path) - 1;
        memcpy(path, raw_url, plen);
        strncpy(query, qmark + 1, sizeof(query) - 1);
    } else {
        strncpy(path, raw_url, sizeof(path) - 1);
    }

    if (strcmp(path, "/open") == 0) {
        char target[2048];
        get_query_param(query, "url", target, sizeof(target));
        /* Strictly allow http:// or https:// URLs only */
        if (_strnicmp(target, "https://", 8) == 0 || _strnicmp(target, "http://", 7) == 0) {
            WCHAR wurl[2048];
            if (MultiByteToWideChar(CP_UTF8, 0, target, -1, wurl, 2048)) {
                ShellExecuteW(NULL, L"open", wurl, NULL, NULL, SW_SHOWNORMAL);
            }
        }
        send_http(c, 200, "OK", "application/json", NULL, "{\"ok\":true}", 11);
    } else if (strcmp(path, "/focus-obs") == 0) {
        focus_obs_window();
        send_http(c, 200, "OK", "application/json", NULL, "{\"ok\":true}", 11);
    } else if (strcmp(path, "/open-uninstaller") == 0) {
        char unins_path[MAX_PATH];
        snprintf(unins_path, sizeof(unins_path), "%s\\unins000.exe", g_bridge_dir);
        BOOL found = file_exists_utf8(unins_path);
        WCHAR wargs[MAX_PATH + 32];
        if (found) {
            WCHAR wpath[MAX_PATH];
            if (MultiByteToWideChar(CP_UTF8, 0, unins_path, -1, wpath, MAX_PATH)) {
                swprintf(wargs, MAX_PATH + 32, L"/select,\"%s\"", wpath);
                ShellExecuteW(NULL, L"open", L"explorer.exe", wargs, NULL, SW_SHOWNORMAL);
            }
            send_http(c, 200, "OK", "application/json", NULL, "{\"ok\":true,\"found\":true}", 24);
        } else {
            WCHAR wdir[MAX_PATH];
            if (MultiByteToWideChar(CP_UTF8, 0, g_bridge_dir, -1, wdir, MAX_PATH)) {
                ShellExecuteW(NULL, L"open", L"explorer.exe", wdir, NULL, SW_SHOWNORMAL);
            }
            send_http(c, 200, "OK", "application/json", NULL, "{\"ok\":true,\"found\":false}", 25);
        }
    } else if (strcmp(path, "/obs-config") == 0) {
        char pass[256];
        int port = 4455;
        get_obs_ws_config(pass, sizeof(pass), &port);
        size_t jcap = 512, jlen = 0;
        char *j = (char *)malloc(jcap);
        jlen += (size_t)sprintf(j, "{\"server_password\":\"");
        json_escape_append(pass, &j, &jlen, &jcap);
        jlen += (size_t)sprintf(j + jlen, "\",\"server_port\":%d,\"auth_required\":%s}", port, pass[0] ? "true" : "false");
        send_http(c, 200, "OK", "application/json", NULL, j, jlen);
        free(j);
    } else if (strcmp(path, "/remote") == 0 || strcmp(path, "/remote.html") == 0) {
        char rfile[MAX_PATH];
        snprintf(rfile, sizeof(rfile), "%s\\remote.html", g_bridge_dir);
        sync_remote_from_cloud_if_stale(rfile);
        if (!file_exists_utf8(rfile)) {
            snprintf(rfile, sizeof(rfile), "%s\\remote.html", g_obs_plugin_dir);
        }
        size_t flen = 0;
        char *html = read_file_alloc(rfile, &flen);
        if (html) {
            send_http(c, 200, "OK", "text/html; charset=utf-8", "Cache-Control: no-cache, no-store, must-revalidate\r\nPragma: no-cache\r\n", html, flen);
            free(html);
        } else {
            send_http(c, 404, "Not Found", "text/plain", NULL, "remote.html not found", 21);
        }
    } else if (strcmp(path, "/machine-id") == 0) {
        char mid[128], out[384];
        get_or_create_machine_id(mid, sizeof(mid));
        int olen = snprintf(out, sizeof(out), "{\"ok\":true,\"machineId\":\"%s\",\"hwid\":\"%s\"}", mid, mid);
        send_http(c, 200, "OK", "application/json", NULL, out, (size_t)olen);
    } else if (strcmp(path, "/remote-config") == 0) {
        char pass[256], lan_ip[64], mid[128], cname[128] = "Broadcasting Workstation", auth_tok[2048] = {0};
        int obs_port = 4455;
        get_obs_ws_config(pass, sizeof(pass), &obs_port);
        get_lan_ipv4(lan_ip, sizeof(lan_ip));
        get_or_create_machine_id(mid, sizeof(mid));
        DWORD csz = sizeof(cname);
        GetComputerNameA(cname, &csz);
        BOOL obs_online = is_tcp_port_open("127.0.0.1", obs_port, 200);

        char afile[MAX_PATH];
        snprintf(afile, sizeof(afile), "%s\\auth_token.txt", g_obs_plugin_dir);
        size_t alen = 0;
        char *atxt = read_file_alloc(afile, &alen);
        if (atxt) {
            char *s = atxt;
            while (*s && isspace((unsigned char)*s)) s++;
            size_t sl = strlen(s);
            while (sl > 0 && isspace((unsigned char)s[sl - 1])) s[--sl] = '\0';
            strncpy(auth_tok, s, sizeof(auth_tok) - 1);
            free(atxt);
        }

        char btitle[2048], bdesc[4096], *dests = NULL;
        EnterCriticalSection(&g_state_lock);
        load_broadcast_state(btitle, sizeof(btitle), bdesc, sizeof(bdesc), &dests);
        char cfgfile[MAX_PATH];
        snprintf(cfgfile, sizeof(cfgfile), "%s\\config.json", g_obs_plugin_dir);
        size_t clen = 0;
        char *craw = read_file_alloc(cfgfile, &clen);
        if (craw) {
            char *outs = json_extract_array_alloc(craw, "outputs");
            if (outs) { free(dests); dests = outs; }
            free(craw);
        }
        LeaveCriticalSection(&g_state_lock);

        size_t jcap = 8192 + strlen(dests ? dests : "[]"), jlen = 0;
        char *j = (char *)malloc(jcap);
        jlen += (size_t)sprintf(j, "{\"ok\":true,\"obsOnline\":%s,\"bridgePort\":%d,\"obsPort\":%d,\"hostIp\":\"%s\",\"machineId\":\"%s\",\"hwid\":\"%s\",\"machineName\":\"",
            obs_online ? "true" : "false", BRIDGE_PORT, obs_port, lan_ip, mid, mid);
        json_escape_append(cname, &j, &jlen, &jcap);
        jlen += (size_t)sprintf(j + jlen, "\",\"authToken\":\"");
        json_escape_append(auth_tok, &j, &jlen, &jcap);
        jlen += (size_t)sprintf(j + jlen, "\",\"obsPass\":\"");
        json_escape_append(pass, &j, &jlen, &jcap);
        jlen += (size_t)sprintf(j + jlen, "\",\"title\":\"");
        json_escape_append(btitle, &j, &jlen, &jcap);
        jlen += (size_t)sprintf(j + jlen, "\",\"description\":\"");
        json_escape_append(bdesc, &j, &jlen, &jcap);
        const char *dj = dests ? dests : "[]";
        if (jlen + strlen(dj) + 32 >= jcap) { jcap += strlen(dj) + 256; j = (char *)realloc(j, jcap); }
        jlen += (size_t)sprintf(j + jlen, "\",\"destinations\":%s}", dj);
        send_http(c, 200, "OK", "application/json; charset=utf-8", NULL, j, jlen);
        free(j);
        free(dests);
    } else if (strcmp(path, "/save-title") == 0) {
        char new_title[2048], new_desc[4096];
        BOOL has_t = FALSE, has_d = FALSE;
        if (body_len > 0) {
            has_t = json_extract_string(body, "title", new_title, sizeof(new_title));
            has_d = json_extract_string(body, "description", new_desc, sizeof(new_desc));
        }
        if (!has_t && query[0]) {
            get_query_param(query, "title", new_title, sizeof(new_title));
            if (new_title[0]) has_t = TRUE;
            get_query_param(query, "description", new_desc, sizeof(new_desc));
            if (new_desc[0]) has_d = TRUE;
        }
        if (has_t || has_d) {
            char cur_t[2048], cur_d[4096], *dests = NULL;
            EnterCriticalSection(&g_state_lock);
            load_broadcast_state(cur_t, sizeof(cur_t), cur_d, sizeof(cur_d), &dests);
            save_broadcast_state(has_t ? new_title : cur_t, has_d ? new_desc : cur_d, dests);
            LeaveCriticalSection(&g_state_lock);
            free(dests);
        }
        send_http(c, 200, "OK", "application/json; charset=utf-8", NULL, "{\"status\":\"ok\"}", 15);
    } else if (strcmp(path, "/toggle-destination") == 0) {
        char did[256], en_str[32];
        get_query_param(query, "id", did, sizeof(did));
        get_query_param(query, "enabled", en_str, sizeof(en_str));
        int force_st = -1;
        if (en_str[0]) force_st = (strcmp(en_str, "1") == 0 || _stricmp(en_str, "true") == 0) ? 1 : 0;
        if (did[0]) {
            char cur_t[2048], cur_d[4096], *dests = NULL;
            EnterCriticalSection(&g_state_lock);
            load_broadcast_state(cur_t, sizeof(cur_t), cur_d, sizeof(cur_d), &dests);
            char *updated = update_dest_enabled_in_json(dests, did, force_st);
            if (updated) {
                save_broadcast_state(cur_t, cur_d, updated);
                free(updated);
            }
            LeaveCriticalSection(&g_state_lock);
            free(dests);
        }
        send_http(c, 200, "OK", "application/json", NULL, "{\"status\":\"ok\"}", 15);
    } else if (strcmp(path, "/sync-destinations") == 0 && _stricmp(method, "POST") == 0) {
        char *in_arr = json_extract_array_alloc(body, "destinations");
        if (in_arr) {
            char cur_t[2048], cur_d[4096], *dests = NULL;
            EnterCriticalSection(&g_state_lock);
            load_broadcast_state(cur_t, sizeof(cur_t), cur_d, sizeof(cur_d), &dests);
            const char *p = in_arr;
            while ((p = strstr(p, "\"id\"")) != NULL) {
                const char *obj = p;
                while (obj > in_arr && *obj != '{') obj--;
                const char *end = strchr(p, '}');
                if (*obj == '{' && end) {
                    char tmp_obj[1024];
                    size_t olen = (size_t)(end - obj + 1);
                    if (olen < sizeof(tmp_obj)) {
                        memcpy(tmp_obj, obj, olen);
                        tmp_obj[olen] = '\0';
                        char did[256];
                        if (json_extract_string(tmp_obj, "id", did, sizeof(did)) && did[0]) {
                            int force_st = strstr(tmp_obj, "\"enabled\":true") ? 1 : 0;
                            char *updated = update_dest_enabled_in_json(dests, did, force_st);
                            if (updated) { free(dests); dests = updated; }
                        }
                    }
                    p = end + 1;
                } else {
                    p += 4;
                }
            }
            save_broadcast_state(cur_t, cur_d, dests);
            LeaveCriticalSection(&g_state_lock);
            free(dests);
            free(in_arr);
        }
        send_http(c, 200, "OK", "application/json", NULL, "{\"status\":\"ok\"}", 15);
    } else if (strcmp(path, "/save-state-destinations") == 0 && _stricmp(method, "POST") == 0) {
        char *arr = json_extract_array_alloc(body, "destinations");
        if (arr) {
            char cur_t[2048], cur_d[4096], *old_dests = NULL;
            EnterCriticalSection(&g_state_lock);
            load_broadcast_state(cur_t, sizeof(cur_t), cur_d, sizeof(cur_d), &old_dests);
            save_broadcast_state(cur_t, cur_d, arr);
            LeaveCriticalSection(&g_state_lock);
            free(old_dests);
            free(arr);
        }
        send_http(c, 200, "OK", "application/json", NULL, "{\"status\":\"ok\"}", 15);
    } else if (strcmp(path, "/save-destinations") == 0 && _stricmp(method, "POST") == 0) {
        ensure_dir_utf8(g_obs_plugin_dir);
        char cfile[MAX_PATH];
        snprintf(cfile, sizeof(cfile), "%s\\config.json", g_obs_plugin_dir);
        if (!strstr(body, "\"armed\"") && strstr(body, "\"outputs\"") && !strstr(body, "\"outputs\":[]")) {
            /* Inject "armed":true cleanly after opening brace */
            const char *brace = strchr(body, '{');
            if (brace) {
                size_t prefix = (size_t)(brace - body + 1);
                char *patched = (char *)malloc(body_len + 16);
                if (patched) {
                    memcpy(patched, body, prefix);
                    memcpy(patched + prefix, "\"armed\":true,", 13);
                    memcpy(patched + prefix + 13, body + prefix, body_len - prefix);
                    write_file_utf8(cfile, patched, body_len + 13);
                    free(patched);
                }
            } else {
                write_file_utf8(cfile, body, body_len);
            }
        } else {
            write_file_utf8(cfile, body, body_len);
        }
        send_http(c, 200, "OK", "application/json", NULL, "{\"ok\":true}", 11);
    } else if (strcmp(path, "/save-secondary") == 0) {
        char en[16], srv[1024], key[1024];
        get_query_param(query, "enabled", en, sizeof(en));
        get_query_param(query, "server", srv, sizeof(srv));
        get_query_param(query, "key", key, sizeof(key));
        BOOL is_en = (strcmp(en, "1") == 0);
        size_t jcap = 2560, jlen = 0;
        char *j = (char *)malloc(jcap);
        jlen += (size_t)sprintf(j, "{\"enabled\":%s,\"armed\":%s,\"server\":\"", is_en ? "true" : "false", is_en ? "true" : "false");
        json_escape_append(srv, &j, &jlen, &jcap);
        jlen += (size_t)sprintf(j + jlen, "\",\"key\":\"");
        json_escape_append(key, &j, &jlen, &jcap);
        jlen += (size_t)sprintf(j + jlen, "\"}");
        ensure_dir_utf8(g_obs_plugin_dir);
        char cfile[MAX_PATH];
        snprintf(cfile, sizeof(cfile), "%s\\config.json", g_obs_plugin_dir);
        write_file_utf8(cfile, j, jlen);
        free(j);
        send_http(c, 200, "OK", "application/json", NULL, "{\"ok\":true}", 11);
    } else if (strcmp(path, "/auth-challenge") == 0) {
        char salt[256], chal[256], pass[256];
        int port = 4455;
        get_query_param(query, "salt", salt, sizeof(salt));
        get_query_param(query, "challenge", chal, sizeof(chal));
        get_obs_ws_config(pass, sizeof(pass), &port);
        char step1[600], sec_b64[128], step2[512], auth_b64[128];
        unsigned char h1[32], h2[32];
        snprintf(step1, sizeof(step1), "%s%s", pass, salt);
        sha256_bytes(step1, strlen(step1), h1);
        base64_encode(h1, 32, sec_b64, sizeof(sec_b64));
        snprintf(step2, sizeof(step2), "%s%s", sec_b64, chal);
        sha256_bytes(step2, strlen(step2), h2);
        base64_encode(h2, 32, auth_b64, sizeof(auth_b64));
        char out[256];
        int olen = snprintf(out, sizeof(out), "{\"authResponse\":\"%s\"}", auth_b64);
        send_http(c, 200, "OK", "application/json", NULL, out, (size_t)olen);
    } else if (strcmp(path, "/save-auth") == 0) {
        char tok[2048] = {0};
        get_query_param(query, "token", tok, sizeof(tok));
        if (!tok[0] && body_len > 0) json_extract_string(body, "token", tok, sizeof(tok));
        if (tok[0]) {
            ensure_dir_utf8(g_obs_plugin_dir);
            char afile[MAX_PATH];
            snprintf(afile, sizeof(afile), "%s\\auth_token.txt", g_obs_plugin_dir);
            write_file_utf8(afile, tok, strlen(tok));
            focus_obs_window();
        }
        send_http(c, 200, "OK", "application/json", NULL, "{\"ok\":true}", 11);
    } else if (strcmp(path, "/update-remote") == 0 && _stricmp(method, "POST") == 0) {
        if (body_len > 0 && strstr(body, "<html") && strstr(body, "SIMPLE STREAMER")) {
            char p1[MAX_PATH], p2[MAX_PATH];
            ensure_dir_utf8(g_obs_plugin_dir);
            snprintf(p1, sizeof(p1), "%s\\remote.html", g_obs_plugin_dir);
            write_file_utf8(p1, body, body_len);
            ensure_dir_utf8(g_bridge_dir);
            snprintf(p2, sizeof(p2), "%s\\remote.html", g_bridge_dir);
            write_file_utf8(p2, body, body_len);
        }
        send_http(c, 200, "OK", "application/json", NULL, "{\"ok\":true}", 11);
    } else if (strcmp(path, "/dock") == 0 || strcmp(path, "/dock/") == 0 || strcmp(path, "/dock/index.html") == 0) {
        send_http(c, 302, "Found", "text/plain", "Location: https://simple-streamer.bdjlmn.com/dock\r\n", "", 0);
    } else if (strcmp(path, "/manifest.json") == 0) {
        char mfile[MAX_PATH];
        snprintf(mfile, sizeof(mfile), "%s\\manifest.json", g_bridge_dir);
        if (!file_exists_utf8(mfile)) snprintf(mfile, sizeof(mfile), "%s\\manifest.json", g_obs_plugin_dir);
        size_t flen = 0;
        char *m = read_file_alloc(mfile, &flen);
        if (m) {
            send_http(c, 200, "OK", "application/manifest+json; charset=utf-8", "Cache-Control: no-cache\r\n", m, flen);
            free(m);
        } else {
            const char *fb = "{\"id\":\"/remote\",\"name\":\"Simple Streamer\",\"short_name\":\"Streamer\",\"start_url\":\"/remote\",\"scope\":\"/\",\"display\":\"standalone\",\"background_color\":\"#0d0f12\",\"theme_color\":\"#0d0f12\"}";
            send_http(c, 200, "OK", "application/manifest+json; charset=utf-8", "Cache-Control: no-cache\r\n", fb, strlen(fb));
        }
    } else {
        /* Static file fallback (blocking .. traversal) */
        const char *rel = path;
        while (*rel == '/') rel++;
        if (strncmp(rel, "dock/", 5) == 0) rel += 5;
        if (*rel && !strstr(rel, "..")) {
            char rel_win[MAX_PATH];
            strncpy(rel_win, rel, sizeof(rel_win) - 1);
            rel_win[sizeof(rel_win) - 1] = '\0';
            for (char *p = rel_win; *p; p++) if (*p == '/') *p = '\\';

            char cand[MAX_PATH];
            snprintf(cand, sizeof(cand), "%s\\%s", g_bridge_dir, rel_win);
            if (!file_exists_utf8(cand)) snprintf(cand, sizeof(cand), "%s\\%s", g_obs_plugin_dir, rel_win);
            size_t flen = 0;
            char *fbytes = read_file_alloc(cand, &flen);
            if (fbytes) {
                send_http(c, 200, "OK", mime_from_path(cand), "Cache-Control: no-cache\r\n", fbytes, flen);
                free(fbytes);
                free(buf); closesocket(c); return;
            }
        }
        send_http(c, 200, "OK", "application/json", NULL, "{\"ok\":true}", 11);
    }

    free(buf);
    closesocket(c);
}

/* ---------- Worker Threads ---------- */

static DWORD WINAPI http_client_thread(LPVOID param) {
    handle_http_client((SOCKET)(uintptr_t)param);
    return 0;
}

static DWORD WINAPI udp_discover_thread(LPVOID param) {
    (void)param;
    SOCKET u = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (u == INVALID_SOCKET) return 0;
    BOOL bcast = TRUE, reuse = TRUE;
    setsockopt(u, SOL_SOCKET, SO_BROADCAST, (const char *)&bcast, sizeof(bcast));
    setsockopt(u, SOL_SOCKET, SO_REUSEADDR, (const char *)&reuse, sizeof(reuse));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(DISCOVER_PORT);
    if (bind(u, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        closesocket(u);
        return 0;
    }

    char rbuf[512];
    for (;;) {
        struct sockaddr_in from;
        int flen = sizeof(from);
        int n = recvfrom(u, rbuf, sizeof(rbuf) - 1, 0, (struct sockaddr *)&from, &flen);
        if (n <= 0) { Sleep(50); continue; }
        rbuf[n] = '\0';
        if (strstr(rbuf, "SIMPLE_STREAMER_DISCOVER")) {
            char pass[256];
            int obs_port = 4455;
            get_obs_ws_config(pass, sizeof(pass), &obs_port);
            if (is_tcp_port_open("127.0.0.1", obs_port, 200)) {
                char resp[64];
                int rlen = snprintf(resp, sizeof(resp), "SIMPLE_STREAMER_HERE:%d:%d", BRIDGE_PORT, obs_port);
                sendto(u, resp, rlen, 0, (struct sockaddr *)&from, flen);
            }
        }
    }
    return 0;
}

int WINAPI WinMain(HINSTANCE hInst, HINSTANCE hPrev, LPSTR lpCmd, int nShow) {
    (void)hInst; (void)hPrev; (void)lpCmd; (void)nShow;

    /* Single-instance mutex */
    HANDLE hMutex = CreateMutexA(NULL, TRUE, "Local\\SimpleStreamerBridgeMutex");
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        if (hMutex) CloseHandle(hMutex);
        return 0;
    }

    CoInitializeEx(NULL, COINIT_MULTITHREADED);
    InitializeCriticalSection(&g_state_lock);

    char local_app[MAX_PATH], roam_app[MAX_PATH];
    get_env_utf8(L"LOCALAPPDATA", local_app, sizeof(local_app), "C:\\Temp");
    get_env_utf8(L"APPDATA", roam_app, sizeof(roam_app), "C:\\Temp");
    snprintf(g_bridge_dir, sizeof(g_bridge_dir), "%s\\SimpleStreamer", local_app);
    snprintf(g_obs_dir, sizeof(g_obs_dir), "%s\\obs-studio", roam_app);
    snprintf(g_obs_plugin_dir, sizeof(g_obs_plugin_dir), "%s\\plugin_config\\simple-streamer", g_obs_dir);

    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 1;

    HANDLE hUdp = CreateThread(NULL, 0, udp_discover_thread, NULL, 0, NULL);
    if (hUdp) CloseHandle(hUdp);

    SOCKET srv = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (srv == INVALID_SOCKET) return 1;
    BOOL reuse = TRUE;
    setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, (const char *)&reuse, sizeof(reuse));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(BRIDGE_PORT);

    if (bind(srv, (struct sockaddr *)&addr, sizeof(addr)) != 0 || listen(srv, SOMAXCONN) != 0) {
        closesocket(srv);
        return 1;
    }

    for (;;) {
        SOCKET client = accept(srv, NULL, NULL);
        if (client == INVALID_SOCKET) continue;
        HANDLE ht = CreateThread(NULL, 0, http_client_thread, (LPVOID)(uintptr_t)client, 0, NULL);
        if (ht) CloseHandle(ht);
        else closesocket(client);
    }
    return 0;
}
