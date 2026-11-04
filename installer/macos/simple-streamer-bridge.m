// Simple Streamer External Browser Bridge & Config Provider for macOS
// Compiles into a ~60KB native Universal binary with zero external dependencies.

#import <Foundation/Foundation.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <string.h>
#include <spawn.h>

#define BRIDGE_PORT 45455

extern char **environ;

static void launch_browser(NSString *urlStr) {
    if (!urlStr || urlStr.length == 0) return;
    const char *url_cstr = [urlStr UTF8String];
    pid_t pid;
    char *argv[] = {"/usr/bin/open", (char *)url_cstr, NULL};
    posix_spawn(&pid, "/usr/bin/open", NULL, NULL, argv, environ);
    int status;
    waitpid(pid, &status, 0);
}

static void close_auth_tabs() {
    NSString *source = @"tell application \"System Events\"\n"
                       @"set browserList to {\"Brave Browser\", \"Google Chrome\", \"Safari\", \"Microsoft Edge\", \"Arc\"}\n"
                       @"repeat with bName in browserList\n"
                       @"if exists (process bName) then\n"
                       @"try\n"
                       @"tell application bName\n"
                       @"repeat with w in windows\n"
                       @"repeat with t in tabs of w\n"
                       @"if URL of t contains \"simple-streamer\" or URL of t contains \"auth/callback\" then\n"
                       @"close t\n"
                       @"end if\n"
                       @"end repeat\n"
                       @"end repeat\n"
                       @"end tell\n"
                       @"end try\n"
                       @"end if\n"
                       @"end repeat\n"
                       @"end tell";
    NSAppleScript *script = [[NSAppleScript alloc] initWithSource:source];
    [script executeAndReturnError:nil];
}

static void focus_obs() {
    close_auth_tabs();
    pid_t pid;
    char *argv[] = {"/usr/bin/open", "-b", "com.obsproject.obs-studio", NULL};
    posix_spawn(&pid, "/usr/bin/open", NULL, NULL, argv, environ);
    int status;
    waitpid(pid, &status, 0);
}

static NSData* get_obs_config() {
    NSString *home = NSHomeDirectory();
    NSString *configPath = [home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json"];
    if ([[NSFileManager defaultManager] fileExistsAtPath:configPath]) {
        NSData *data = [NSData dataWithContentsOfFile:configPath];
        if (data) return data;
    }
    return [@"{\"auth_required\":false}" dataUsingEncoding:NSUTF8StringEncoding];
}

static void save_secondary_config(BOOL enabled, NSString *server, NSString *key) {
    NSString *home = NSHomeDirectory();
    NSString *dir = [home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/simple-streamer"];
    [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    NSString *path = [dir stringByAppendingPathComponent:@"config.json"];
    NSDictionary *dict = @{
        @"enabled": @(enabled),
        @"server": server ?: @"",
        @"key": key ?: @""
    };
    NSData *data = [NSJSONSerialization dataWithJSONObject:dict options:NSJSONWritingPrettyPrinted error:nil];
    [data writeToFile:path atomically:YES];
}

static void save_destinations_json(NSData *jsonData) {
    if (!jsonData || jsonData.length == 0) return;
    NSString *home = NSHomeDirectory();
    NSString *dir = [home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/simple-streamer"];
    [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    NSString *path = [dir stringByAppendingPathComponent:@"config.json"];
    [jsonData writeToFile:path atomically:YES];
}

int main(int argc, char *argv[]) {
    @autoreleasepool {
        int server_fd, client_fd;
        struct sockaddr_in address;
        int opt = 1;
        int addrlen = sizeof(address);

        if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) {
            return 1;
        }

        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

        address.sin_family = AF_INET;
        address.sin_addr.s_addr = inet_addr("127.0.0.1");
        address.sin_port = htons(BRIDGE_PORT);

        if (bind(server_fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
            return 1;
        }

        if (listen(server_fd, 10) < 0) {
            return 1;
        }

        while (1) {
            client_fd = accept(server_fd, (struct sockaddr *)&address, (socklen_t*)&addrlen);
            if (client_fd < 0) continue;

            char buffer[8192] = {0};
            read(client_fd, buffer, sizeof(buffer) - 1);

            NSString *request = [NSString stringWithUTF8String:buffer];
            if (request) {
                // Preflight OPTIONS (Private Network Access & CORS)
                if ([request hasPrefix:@"OPTIONS"]) {
                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                                       "Access-Control-Allow-Headers: *\r\n"
                                       "Content-Length: 0\r\n\r\n";
                    write(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/obs-config"]) {
                    NSData *cfgData = get_obs_config();
                    NSString *header = [NSString stringWithFormat:
                                       @"HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: %lu\r\n\r\n", (unsigned long)cfgData.length];
                    write(client_fd, [header UTF8String], strlen([header UTF8String]));
                    write(client_fd, [cfgData bytes], cfgData.length);
                } else if ([request containsString:@"/save-secondary"]) {
                    BOOL enabled = [request containsString:@"enabled=1"] || [request containsString:@"enabled=true"];
                    NSString *server = @"rtmp://a.rtmp.youtube.com/live2";
                    NSString *key = @"";

                    NSRange sRange = [request rangeOfString:@"server="];
                    if (sRange.location != NSNotFound) {
                        NSUInteger start = sRange.location + sRange.length;
                        NSUInteger end = [request rangeOfString:@"&" options:0 range:NSMakeRange(start, request.length - start)].location;
                        if (end == NSNotFound) {
                            end = [request rangeOfString:@" " options:0 range:NSMakeRange(start, request.length - start)].location;
                        }
                        if (end != NSNotFound) {
                            server = [[request substringWithRange:NSMakeRange(start, end - start)] stringByRemovingPercentEncoding];
                        }
                    }

                    NSRange kRange = [request rangeOfString:@"key="];
                    if (kRange.location != NSNotFound) {
                        NSUInteger start = kRange.location + kRange.length;
                        NSUInteger end = [request rangeOfString:@"&" options:0 range:NSMakeRange(start, request.length - start)].location;
                        if (end == NSNotFound) {
                            end = [request rangeOfString:@" " options:0 range:NSMakeRange(start, request.length - start)].location;
                        }
                        if (end != NSNotFound) {
                            key = [[request substringWithRange:NSMakeRange(start, end - start)] stringByRemovingPercentEncoding];
                        }
                    }

                    save_secondary_config(enabled, server, key);

                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 15\r\n\r\n"
                                       "{\"status\":\"ok\"}";
                    write(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/save-destinations"]) {
                    NSRange bodyRange = [request rangeOfString:@"\r\n\r\n"];
                    if (bodyRange.location != NSNotFound) {
                        NSString *bodyStr = [request substringFromIndex:bodyRange.location + 4];
                        NSData *bodyData = [bodyStr dataUsingEncoding:NSUTF8StringEncoding];
                        if (bodyData && bodyData.length > 0) {
                            save_destinations_json(bodyData);
                        }
                    }
                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 15\r\n\r\n"
                                       "{\"status\":\"ok\"}";
                    write(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/focus-obs"]) {
                    focus_obs();
                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 15\r\n\r\n"
                                       "{\"status\":\"ok\"}";
                    write(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/open?url="]) {
                    NSRange range = [request rangeOfString:@"/open?url="];
                    NSUInteger start = range.location + range.length;
                    NSUInteger end = [request rangeOfString:@" " options:0 range:NSMakeRange(start, request.length - start)].location;
                    if (end != NSNotFound) {
                        NSString *rawUrl = [request substringWithRange:NSMakeRange(start, end - start)];
                        NSString *decodedUrl = [rawUrl stringByRemovingPercentEncoding];
                        if (decodedUrl && ([decodedUrl hasPrefix:@"https://"] || [decodedUrl hasPrefix:@"http://"])) {
                            launch_browser(decodedUrl);
                        }
                    }

                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 15\r\n\r\n"
                                       "{\"status\":\"ok\"}";
                    write(client_fd, resp, strlen(resp));
                } else {
                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 15\r\n\r\n"
                                       "{\"status\":\"ok\"}";
                    write(client_fd, resp, strlen(resp));
                }
            }
            close(client_fd);
        }
    }
    return 0;
}
