// Simple Streamer External Browser Bridge & Config Provider for macOS
// Compiles into a ~60KB native Universal binary with zero external dependencies.

#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonDigest.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <string.h>
#include <spawn.h>
#include <ifaddrs.h>
#include <pthread.h>
#include <signal.h>
#include <fcntl.h>

#define BRIDGE_PORT 45455
#define UDP_DISCOVERY_PORT 45456

extern char **environ;

static NSString* get_local_lan_ip() {
    NSString *address = @"127.0.0.1";
    struct ifaddrs *interfaces = NULL;
    struct ifaddrs *temp_addr = NULL;
    int success = getifaddrs(&interfaces);
    if (success == 0) {
        temp_addr = interfaces;
        while (temp_addr != NULL) {
            if (temp_addr->ifa_addr && temp_addr->ifa_addr->sa_family == AF_INET) {
                NSString *name = [NSString stringWithUTF8String:temp_addr->ifa_name];
                // Prefer en0, en1 (Wi-Fi / Ethernet)
                if ([name hasPrefix:@"en"] || [name hasPrefix:@"wl"]) {
                    NSString *ip = [NSString stringWithUTF8String:inet_ntoa(((struct sockaddr_in *)temp_addr->ifa_addr)->sin_addr)];
                    if (![ip hasPrefix:@"127."] && ![ip hasPrefix:@"169.254."]) {
                        address = ip;
                        break;
                    }
                }
            }
            temp_addr = temp_addr->ifa_next;
        }
    }
    if (interfaces) freeifaddrs(interfaces);
    return address;
}

static BOOL is_obs_online(int port) {
    int s = socket(AF_INET, SOCK_STREAM, 0);
    if (s < 0) return NO;
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);
    struct timeval tv;
    tv.tv_sec = 0;
    tv.tv_usec = 150000; // 150ms timeout
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char*)&tv, sizeof(tv));
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char*)&tv, sizeof(tv));
    int res = connect(s, (struct sockaddr*)&addr, sizeof(addr));
    close(s);
    return (res == 0);
}

static void *udp_discovery_thread(void *arg) {
    int udp_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (udp_fd < 0) return NULL;

    int opt = 1;
    setsockopt(udp_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    setsockopt(udp_fd, SOL_SOCKET, SO_BROADCAST, &opt, sizeof(opt));

    struct sockaddr_in saddr;
    memset(&saddr, 0, sizeof(saddr));
    saddr.sin_family = AF_INET;
    saddr.sin_addr.s_addr = htonl(INADDR_ANY);
    saddr.sin_port = htons(UDP_DISCOVERY_PORT);

    if (bind(udp_fd, (struct sockaddr *)&saddr, sizeof(saddr)) < 0) {
        close(udp_fd);
        return NULL;
    }

    char buf[1024];
    struct sockaddr_in client_addr;
    socklen_t client_len = sizeof(client_addr);

    while (1) {
        ssize_t n = recvfrom(udp_fd, buf, sizeof(buf) - 1, 0, (struct sockaddr *)&client_addr, &client_len);
        if (n > 0) {
            buf[n] = '\0';
            if (strstr(buf, "SIMPLE_STREAMER_DISCOVER")) {
                const char *reply = "SIMPLE_STREAMER_HERE:45455:4455";
                sendto(udp_fd, reply, strlen(reply), 0, (struct sockaddr *)&client_addr, client_len);
            }
        }
    }
    close(udp_fd);
    return NULL;
}

static void *mdns_supervisor_thread(void *arg) {
    pid_t dns_sd_pid = 0;
    NSString *lastIp = @"";

    while (1) {
        @autoreleasepool {
            BOOL obsOnline = is_obs_online(4455);
            if (!obsOnline) {
                // If OBS is not running, stop advertising mDNS so idle machines never hijack discovery
                if (dns_sd_pid > 0) {
                    kill(dns_sd_pid, SIGTERM);
                    waitpid(dns_sd_pid, NULL, WNOHANG);
                    dns_sd_pid = 0;
                }
            } else {
                NSString *currentIp = get_local_lan_ip();
                if (currentIp && ![currentIp isEqualToString:@"127.0.0.1"]) {
                    BOOL needsRestart = NO;
                    if (![currentIp isEqualToString:lastIp] || dns_sd_pid == 0) {
                        needsRestart = YES;
                    } else if (dns_sd_pid > 0) {
                        if (kill(dns_sd_pid, 0) != 0) {
                            needsRestart = YES;
                        }
                    }

                    if (needsRestart) {
                        if (dns_sd_pid > 0) {
                            kill(dns_sd_pid, SIGTERM);
                            waitpid(dns_sd_pid, NULL, WNOHANG);
                            dns_sd_pid = 0;
                        }

                        char *argv[] = {
                            "/usr/bin/dns-sd",
                            "-P",
                            "Simple Streamer",
                            "_http._tcp",
                            "local",
                            "45455",
                            "simple-streamer.local",
                            (char *)[currentIp UTF8String],
                            NULL
                        };

                        posix_spawn_file_actions_t actions;
                        posix_spawn_file_actions_init(&actions);
                        posix_spawn_file_actions_addopen(&actions, STDOUT_FILENO, "/dev/null", O_WRONLY, 0);
                        posix_spawn_file_actions_addopen(&actions, STDERR_FILENO, "/dev/null", O_WRONLY, 0);

                        posix_spawnattr_t attr;
                        posix_spawnattr_init(&attr);
                        posix_spawnattr_setflags(&attr, POSIX_SPAWN_CLOEXEC_DEFAULT);

                        if (posix_spawn(&dns_sd_pid, "/usr/bin/dns-sd", &actions, &attr, argv, environ) == 0) {
                            lastIp = [currentIp copy];
                            fprintf(stderr, "[Bridge] Registered mDNS simple-streamer.local -> %s (pid %d)\n", [currentIp UTF8String], dns_sd_pid);
                        }
                        posix_spawnattr_destroy(&attr);
                        posix_spawn_file_actions_destroy(&actions);
                    }
                }
            }
        }
        sleep(8);
    }
    return NULL;
}

static NSString* sha256_base64(NSString *input) {
    if (!input) return @"";
    const char *cstr = [input UTF8String];
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(cstr, (CC_LONG)strlen(cstr), digest);
    NSData *data = [NSData dataWithBytes:digest length:CC_SHA256_DIGEST_LENGTH];
    return [data base64EncodedStringWithOptions:0];
}

static NSString* compute_obs_auth(NSString *password, NSString *salt, NSString *challenge) {
    NSString *secret = sha256_base64([NSString stringWithFormat:@"%@%@", password ?: @"", salt ?: @""]);
    return sha256_base64([NSString stringWithFormat:@"%@%@", secret, challenge ?: @""]);
}

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
                       @"if URL of t contains \"auth/callback\" then\n"
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

static NSString* get_or_create_machine_guid() {
    NSString *home = NSHomeDirectory();
    NSString *dir = [home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/simple-streamer"];
    [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    NSString *path = [dir stringByAppendingPathComponent:@"machine_id.txt"];

    if ([[NSFileManager defaultManager] fileExistsAtPath:path]) {
        NSString *cached = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil];
        if (cached) {
            cached = [cached stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            if (cached.length >= 8) return cached;
        }
    }

    NSString *guid = nil;
    NSTask *task = [[NSTask alloc] init];
    task.launchPath = @"/usr/sbin/ioreg";
    task.arguments = @[@"-d2", @"-c", @"IOPlatformExpertDevice"];
    NSPipe *pipe = [NSPipe pipe];
    task.standardOutput = pipe;
    @try {
        [task launch];
        [task waitUntilExit];
        NSData *outData = [[pipe fileHandleForReading] readDataToEndOfFile];
        NSString *outStr = [[NSString alloc] initWithData:outData encoding:NSUTF8StringEncoding];
        if (outStr) {
            NSRange r = [outStr rangeOfString:@"\"IOPlatformUUID\" = \""];
            if (r.location != NSNotFound) {
                NSUInteger start = r.location + r.length;
                NSUInteger end = [outStr rangeOfString:@"\"" options:0 range:NSMakeRange(start, outStr.length - start)].location;
                if (end != NSNotFound) {
                    guid = [outStr substringWithRange:NSMakeRange(start, end - start)];
                }
            }
        }
    } @catch (NSException *e) {}

    if (!guid || guid.length < 8) {
        guid = [[NSUUID UUID] UUIDString];
    }

    [guid writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil];
    return guid;
}

static void save_secondary_config(BOOL enabled, NSString *server, NSString *key) {
    NSString *home = NSHomeDirectory();
    NSString *dir = [home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/simple-streamer"];
    [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    NSString *path = [dir stringByAppendingPathComponent:@"config.json"];
    NSDictionary *dict = @{
        @"enabled": @(enabled),
        @"armed": @(enabled),
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

static NSObject *g_state_lock = nil;

static NSDictionary* get_broadcast_state() {
    @synchronized(g_state_lock ?: (g_state_lock = [NSObject new])) {
        NSString *home = NSHomeDirectory();
        NSString *path = [home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/simple-streamer/broadcast_state.json"];
        NSData *data = [NSData dataWithContentsOfFile:path];
        if (data) {
            NSDictionary *dict = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
            if (dict) return dict;
        }
        return @{
            @"title": @"",
            @"description": @"",
            @"destinations": @[]
        };
    }
}

static void save_broadcast_state(NSDictionary *state) {
    if (!state) return;
    @synchronized(g_state_lock ?: (g_state_lock = [NSObject new])) {
        NSString *home = NSHomeDirectory();
        NSString *dir = [home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/simple-streamer"];
        [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
        NSString *path = [dir stringByAppendingPathComponent:@"broadcast_state.json"];
        NSData *data = [NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingPrettyPrinted error:nil];
        [data writeToFile:path atomically:YES];
    }
}

static ssize_t write_all(int fd, const void *buf, size_t count) {
    size_t total = 0;
    const char *p = (const char *)buf;
    while (total < count) {
        ssize_t n = write(fd, p + total, count - total);
        if (n <= 0) {
            if (n < 0 && (errno == EINTR || errno == EAGAIN)) continue;
            return -1;
        }
        total += n;
    }
    return total;
}

static NSString* get_mime_type(NSString *path) {
    NSString *ext = [path pathExtension].lowercaseString;
    if ([ext isEqualToString:@"html"] || [ext isEqualToString:@"htm"]) return @"text/html; charset=utf-8";
    if ([ext isEqualToString:@"js"] || [ext isEqualToString:@"mjs"]) return @"application/javascript; charset=utf-8";
    if ([ext isEqualToString:@"css"]) return @"text/css; charset=utf-8";
    if ([ext isEqualToString:@"svg"]) return @"image/svg+xml";
    if ([ext isEqualToString:@"png"]) return @"image/png";
    if ([ext isEqualToString:@"jpg"] || [ext isEqualToString:@"jpeg"]) return @"image/jpeg";
    if ([ext isEqualToString:@"json"]) return @"application/json; charset=utf-8";
    return @"application/octet-stream";
}

static BOOL try_serve_static_file(int client_fd, NSString *reqPath, BOOL isHead) {
    if (!reqPath || reqPath.length == 0) return NO;
    NSString *sub = reqPath;
    if ([sub containsString:@"?"]) {
        sub = [sub substringToIndex:[sub rangeOfString:@"?"].location];
    }
    while ([sub hasPrefix:@"/"]) sub = [sub substringFromIndex:1];
    if ([sub hasPrefix:@"dock/"]) sub = [sub substringFromIndex:5];
    if (sub.length == 0 || [sub isEqualToString:@"dock"]) {
        sub = @"index.html";
    } else if ([sub isEqualToString:@"remote"]) {
        sub = @"remote.html";
    }

    NSString *home = NSHomeDirectory();
    NSString *p1 = [[home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/simple-streamer"] stringByAppendingPathComponent:sub];
    NSString *p2 = [@"/Users/mahdi/Business/simple-streamer/dock" stringByAppendingPathComponent:sub];

    NSData *data = [NSData dataWithContentsOfFile:p1];
    if (!data) data = [NSData dataWithContentsOfFile:p2];
    if (!data) return NO;

    NSString *mime = get_mime_type(sub);
    NSString *header = [NSString stringWithFormat:
                       @"HTTP/1.1 200 OK\r\n"
                       "Access-Control-Allow-Origin: *\r\n"
                       "Access-Control-Allow-Private-Network: true\r\n"
                       "Cache-Control: no-cache, no-store, must-revalidate\r\n"
                       "Connection: close\r\n"
                       "Content-Type: %@\r\n"
                       "Content-Length: %lu\r\n\r\n", mime, (unsigned long)data.length];
    write_all(client_fd, [header UTF8String], strlen([header UTF8String]));
    if (!isHead) {
        write_all(client_fd, [data bytes], data.length);
    }
    return YES;
}

static void handle_client(int client_fd, struct sockaddr_in client_addr) {
    int nosigpipe = 1;
    setsockopt(client_fd, SOL_SOCKET, SO_NOSIGPIPE, &nosigpipe, sizeof(nosigpipe));
    fcntl(client_fd, F_SETFD, FD_CLOEXEC);

    struct timeval tv = { 5, 0 };
    setsockopt(client_fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(client_fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    char buffer[8192] = {0};
    ssize_t bytesRead = read(client_fd, buffer, sizeof(buffer) - 1);
    if (bytesRead <= 0) {
        close(client_fd);
        return;
    }

            NSString *request = [[NSString alloc] initWithBytes:buffer length:bytesRead encoding:NSUTF8StringEncoding];
            if (!request) {
                request = [[NSString alloc] initWithBytes:buffer length:bytesRead encoding:NSISOLatin1StringEncoding];
            }
            if (request) {
                NSString *method = @"GET";
                NSString *urlPath = @"/";
                NSRange firstLineEnd = [request rangeOfString:@"\r\n"];
                if (firstLineEnd.location != NSNotFound) {
                    NSString *firstLine = [request substringToIndex:firstLineEnd.location];
                    NSArray *reqParts = [firstLine componentsSeparatedByString:@" "];
                    if (reqParts.count > 0) method = reqParts[0];
                    if (reqParts.count > 1) urlPath = reqParts[1];
                }
                BOOL isHead = [method isEqualToString:@"HEAD"];

                // Preflight OPTIONS (Private Network Access & CORS)
                if ([request hasPrefix:@"OPTIONS"]) {
                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                                       "Access-Control-Allow-Headers: *\r\n"
                                       "Content-Length: 0\r\n\r\n";
                    write_all(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/obs-config"]) {
                    NSData *cfgData = get_obs_config();
                    NSString *header = [NSString stringWithFormat:
                                       @"HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: %lu\r\n\r\n", (unsigned long)cfgData.length];
                    write_all(client_fd, [header UTF8String], strlen([header UTF8String]));
                    write_all(client_fd, [cfgData bytes], cfgData.length);
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
                    write_all(client_fd, resp, strlen(resp));
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
                    write_all(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/save-state-destinations"]) {
                    NSRange bodyRange = [request rangeOfString:@"\r\n\r\n"];
                    if (bodyRange.location != NSNotFound) {
                        NSString *bodyStr = [request substringFromIndex:bodyRange.location + 4];
                        NSData *bodyData = [bodyStr dataUsingEncoding:NSUTF8StringEncoding];
                        if (bodyData) {
                            NSDictionary *json = [NSJSONSerialization JSONObjectWithData:bodyData options:0 error:nil];
                            NSArray *newDests = json[@"destinations"];
                            if (newDests && [newDests isKindOfClass:[NSArray class]]) {
                                NSMutableDictionary *bState = [get_broadcast_state() mutableCopy];
                                bState[@"destinations"] = newDests;
                                save_broadcast_state(bState);
                            }
                        }
                    }
                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 15\r\n\r\n"
                                       "{\"status\":\"ok\"}";
                    write_all(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/sync-destinations"]) {
                    NSRange bodyRange = [request rangeOfString:@"\r\n\r\n"];
                    if (bodyRange.location != NSNotFound) {
                        NSString *bodyStr = [request substringFromIndex:bodyRange.location + 4];
                        NSData *bodyData = [bodyStr dataUsingEncoding:NSUTF8StringEncoding];
                        if (bodyData) {
                            NSDictionary *json = [NSJSONSerialization JSONObjectWithData:bodyData options:0 error:nil];
                            NSArray *newDests = json[@"destinations"];
                            if (newDests && [newDests isKindOfClass:[NSArray class]]) {
                                NSMutableDictionary *bState = [get_broadcast_state() mutableCopy];
                                NSMutableArray *curDests = [bState[@"destinations"] mutableCopy] ?: [NSMutableArray array];
                                BOOL changed = NO;
                                for (NSDictionary *nd in newDests) {
                                    NSString *nid = nd[@"id"] ?: @"";
                                    NSNumber *nenabled = nd[@"enabled"];
                                    if (nid.length == 0 || nenabled == nil) continue;
                                    for (NSUInteger i = 0; i < curDests.count; i++) {
                                        NSMutableDictionary *d = [curDests[i] mutableCopy];
                                        if ([d[@"id"] isEqualToString:nid] || [d[@"name"] isEqualToString:nid] || [d[@"platform"] isEqualToString:nid]) {
                                            if ([d[@"enabled"] boolValue] != [nenabled boolValue]) {
                                                d[@"enabled"] = nenabled;
                                                curDests[i] = d;
                                                changed = YES;
                                            }
                                        }
                                    }
                                }
                                if (changed) {
                                    bState[@"destinations"] = curDests;
                                    save_broadcast_state(bState);
                                }
                            }
                        }
                    }
                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 15\r\n\r\n"
                                       "{\"status\":\"ok\"}";
                    write_all(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/focus-obs"]) {
                    focus_obs();
                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 15\r\n\r\n"
                                       "{\"status\":\"ok\"}";
                    write_all(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/open-uninstaller"]) {
                    NSString *uninsPath = [NSHomeDirectory() stringByAppendingPathComponent:@".simple-streamer/Uninstall Simple Streamer.command"];
                    NSFileManager *fm = [NSFileManager defaultManager];
                    BOOL found = [fm fileExistsAtPath:uninsPath];
                    NSTask *t = [[NSTask alloc] init];
                    t.executableURL = [NSURL fileURLWithPath:@"/usr/bin/open"];
                    if (found) {
                        t.arguments = @[@"-R", uninsPath];
                    } else {
                        NSString *dirPath = [NSHomeDirectory() stringByAppendingPathComponent:@".simple-streamer"];
                        t.arguments = @[dirPath];
                    }
                    @try { [t launchAndReturnError:nil]; } @catch (NSException *e) {}
                    const char *bodyStr = found ? "{\"ok\":true,\"found\":true}" : "{\"ok\":true,\"found\":false}";
                    char hdr[256];
                    int hlen = snprintf(hdr, sizeof(hdr),
                        "HTTP/1.1 200 OK\r\n"
                        "Access-Control-Allow-Origin: *\r\n"
                        "Access-Control-Allow-Private-Network: true\r\n"
                        "Content-Type: application/json\r\n"
                        "Content-Length: %zu\r\n\r\n%s", strlen(bodyStr), bodyStr);
                    write_all(client_fd, hdr, (size_t)hlen);
                } else if ([request containsString:@"/save-auth"]) {
                    NSString *token = @"";
                    NSRange lineEnd = [request rangeOfString:@"\r\n"];
                    if (lineEnd.location != NSNotFound) {
                        NSString *reqLine = [request substringToIndex:lineEnd.location];
                        NSArray *parts = [reqLine componentsSeparatedByString:@" "];
                        if (parts.count >= 2) {
                            NSURLComponents *comp = [NSURLComponents componentsWithString:parts[1]];
                            for (NSURLQueryItem *item in comp.queryItems) {
                                if ([item.name isEqualToString:@"token"]) {
                                    token = item.value ?: @"";
                                    break;
                                }
                            }
                        }
                    }
                    if (token.length == 0) {
                        NSRange bodySep = [request rangeOfString:@"\r\n\r\n"];
                        if (bodySep.location != NSNotFound) {
                            NSString *bodyStr = [request substringFromIndex:bodySep.location + 4];
                            NSData *bData = [bodyStr dataUsingEncoding:NSUTF8StringEncoding];
                            if (bData) {
                                NSDictionary *bJson = [NSJSONSerialization JSONObjectWithData:bData options:0 error:nil];
                                if (bJson && bJson[@"token"]) token = bJson[@"token"];
                            }
                        }
                    }
                    if (token.length > 0) {
                        NSString *appSupport = [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES) firstObject];
                        NSString *cfgDir = [appSupport stringByAppendingPathComponent:@"obs-studio/plugin_config/simple-streamer"];
                        [[NSFileManager defaultManager] createDirectoryAtPath:cfgDir withIntermediateDirectories:YES attributes:nil error:nil];
                        NSString *tokenFile = [cfgDir stringByAppendingPathComponent:@"auth_token.txt"];
                        [token writeToFile:tokenFile atomically:YES encoding:NSUTF8StringEncoding error:nil];
                    }
                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 11\r\n\r\n"
                                       "{\"ok\":true}";
                    write_all(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/machine-id"]) {
                    NSString *mGuid = get_or_create_machine_guid();
                    NSString *json = [NSString stringWithFormat:@"{\"ok\":true,\"machineId\":\"%@\",\"hwid\":\"%@\"}", mGuid, mGuid];
                    NSData *bodyData = [json dataUsingEncoding:NSUTF8StringEncoding];
                    NSString *header = [NSString stringWithFormat:
                                       @"HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Cache-Control: no-cache\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: %lu\r\n\r\n", (unsigned long)bodyData.length];
                    write_all(client_fd, [header UTF8String], strlen([header UTF8String]));
                    write_all(client_fd, [bodyData bytes], bodyData.length);
                } else if ([request containsString:@"/remote-config"]) {
                    NSString *lanIp = get_local_lan_ip();
                    NSData *cfgData = get_obs_config();
                    NSDictionary *obsCfg = [NSJSONSerialization JSONObjectWithData:cfgData options:0 error:nil];
                    int obsPort = 4455;
                    NSString *obsPass = @"";
                    if (obsCfg) {
                        if (obsCfg[@"server_port"]) {
                            obsPort = [obsCfg[@"server_port"] intValue];
                        }
                        if (obsCfg[@"server_password"]) {
                            obsPass = obsCfg[@"server_password"];
                        }
                    }
                    NSDictionary *bState = get_broadcast_state();
                    BOOL obsOnline = is_obs_online(obsPort);
                    NSString *mName = [[NSHost currentHost] localizedName] ?: @"MacBook";
                    NSString *mGuid = get_or_create_machine_guid();
                    NSString *appSupport = [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES) firstObject];
                    NSString *authFile = [appSupport stringByAppendingPathComponent:@"obs-studio/plugin_config/simple-streamer/auth_token.txt"];
                    NSString *authToken = @"";
                    if ([[NSFileManager defaultManager] fileExistsAtPath:authFile]) {
                        authToken = [NSString stringWithContentsOfFile:authFile encoding:NSUTF8StringEncoding error:nil] ?: @"";
                        authToken = [authToken stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
                    }
                    NSMutableDictionary *respDict = [NSMutableDictionary dictionaryWithDictionary:@{
                        @"ok": @YES,
                        @"obsOnline": @(obsOnline),
                        @"machineName": mName,
                        @"machineId": mGuid,
                        @"hwid": mGuid,
                        @"authToken": authToken ?: @"",
                        @"bridgePort": @(BRIDGE_PORT),
                        @"obsPort": @(obsPort),
                        @"hostIp": lanIp ?: @"127.0.0.1",
                        @"obsPass": obsPass ?: @"",
                        @"title": bState[@"title"] ?: @"Live Broadcast",
                        @"description": bState[@"description"] ?: @"",
                        @"destinations": bState[@"destinations"] ?: @[]
                    }];
                    NSData *bodyData = [NSJSONSerialization dataWithJSONObject:respDict options:0 error:nil];
                    NSString *header = [NSString stringWithFormat:
                                       @"HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Cache-Control: no-cache\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: %lu\r\n\r\n", (unsigned long)bodyData.length];
                    write_all(client_fd, [header UTF8String], strlen([header UTF8String]));
                    write_all(client_fd, [bodyData bytes], bodyData.length);
                } else if ([request containsString:@"/save-title"]) {
                    NSString *title = @"";
                    NSString *desc = nil;
                    NSRange lineEnd = [request rangeOfString:@"\r\n"];
                    if (lineEnd.location != NSNotFound) {
                        NSString *reqLine = [request substringToIndex:lineEnd.location];
                        NSArray *parts = [reqLine componentsSeparatedByString:@" "];
                        if (parts.count >= 2) {
                            NSURLComponents *comp = [NSURLComponents componentsWithString:parts[1]];
                            for (NSURLQueryItem *item in comp.queryItems) {
                                if ([item.name isEqualToString:@"title"]) title = [item.value stringByReplacingOccurrencesOfString:@"+" withString:@" "] ?: @"";
                                if ([item.name isEqualToString:@"description"]) desc = [item.value stringByReplacingOccurrencesOfString:@"+" withString:@" "] ?: @"";
                            }
                        }
                    }
                    NSMutableDictionary *bState = [get_broadcast_state() mutableCopy];
                    BOOL changed = NO;
                    if (title.length > 0) {
                        bState[@"title"] = title;
                        changed = YES;
                    }
                    if (desc != nil) {
                        bState[@"description"] = desc;
                        changed = YES;
                    }
                    if (changed) {
                        save_broadcast_state(bState);
                    }
                    const char *resp = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Private-Network: true\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: 15\r\n\r\n{\"status\":\"ok\"}";
                    write_all(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/toggle-destination"]) {
                    NSString *destId = @"";
                    NSString *stateStr = nil;
                    NSRange lineEnd = [request rangeOfString:@"\r\n"];
                    if (lineEnd.location != NSNotFound) {
                        NSString *reqLine = [request substringToIndex:lineEnd.location];
                        NSArray *parts = [reqLine componentsSeparatedByString:@" "];
                        if (parts.count >= 2) {
                            NSURLComponents *comp = [NSURLComponents componentsWithString:parts[1]];
                            for (NSURLQueryItem *item in comp.queryItems) {
                                if ([item.name isEqualToString:@"id"]) destId = item.value ?: @"";
                                if ([item.name isEqualToString:@"enabled"]) stateStr = item.value;
                            }
                        }
                    }
                    NSMutableDictionary *bState = [get_broadcast_state() mutableCopy];
                    NSMutableArray *dests = [bState[@"destinations"] mutableCopy] ?: [NSMutableArray array];
                    BOOL changed = NO;
                    for (NSUInteger i = 0; i < dests.count; i++) {
                        NSMutableDictionary *d = [dests[i] mutableCopy];
                        if ([d[@"id"] isEqualToString:destId] || [d[@"name"] isEqualToString:destId] || [d[@"platform"] isEqualToString:destId]) {
                            BOOL current = [d[@"enabled"] boolValue];
                            BOOL next = (stateStr != nil) ? [stateStr boolValue] : !current;
                            d[@"enabled"] = @(next);
                            dests[i] = d;
                            changed = YES;
                        }
                    }
                    if (changed) {
                        bState[@"destinations"] = dests;
                        save_broadcast_state(bState);
                    }
                    const char *resp = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Private-Network: true\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: 15\r\n\r\n{\"status\":\"ok\"}";
                    write_all(client_fd, resp, strlen(resp));
                } else if ([request containsString:@"/auth-challenge"]) {
                    NSString *salt = @"";
                    NSString *challenge = @"";
                    NSRange lineEnd = [request rangeOfString:@"\r\n"];
                    if (lineEnd.location != NSNotFound) {
                        NSString *reqLine = [request substringToIndex:lineEnd.location];
                        NSArray *parts = [reqLine componentsSeparatedByString:@" "];
                        if (parts.count >= 2) {
                            NSURLComponents *comp = [NSURLComponents componentsWithString:parts[1]];
                            for (NSURLQueryItem *item in comp.queryItems) {
                                if ([item.name isEqualToString:@"salt"]) salt = item.value ?: @"";
                                if ([item.name isEqualToString:@"challenge"]) challenge = item.value ?: @"";
                            }
                        }
                    }
                    NSData *cfgData = get_obs_config();
                    NSDictionary *obsCfg = [NSJSONSerialization JSONObjectWithData:cfgData options:0 error:nil];
                    NSString *pass = obsCfg ? obsCfg[@"server_password"] : @"";
                    NSString *authResp = compute_obs_auth(pass, salt, challenge);
                    NSString *json = [NSString stringWithFormat:@"{\"authResponse\":\"%@\"}", authResp];
                    NSData *bodyData = [json dataUsingEncoding:NSUTF8StringEncoding];
                    NSString *header = [NSString stringWithFormat:
                                       @"HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: %lu\r\n\r\n", (unsigned long)bodyData.length];
                    write_all(client_fd, [header UTF8String], strlen([header UTF8String]));
                    write_all(client_fd, [bodyData bytes], bodyData.length);
                } else if ([request containsString:@"/manifest.json"]) {
                    NSString *manifest = @"{\n"
                                          "  \"id\": \"/remote\",\n"
                                          "  \"name\": \"Simple Streamer\",\n"
                                          "  \"short_name\": \"Streamer\",\n"
                                          "  \"start_url\": \"/remote\",\n"
                                          "  \"scope\": \"/\",\n"
                                          "  \"display\": \"standalone\",\n"
                                          "  \"background_color\": \"#0d0f12\",\n"
                                          "  \"theme_color\": \"#0d0f12\",\n"
                                          "  \"icons\": [\n"
                                          "    {\n"
                                          "      \"src\": \"/icon-192.png\",\n"
                                          "      \"sizes\": \"192x192\",\n"
                                          "      \"type\": \"image/png\",\n"
                                          "      \"purpose\": \"any maskable\"\n"
                                          "    },\n"
                                          "    {\n"
                                          "      \"src\": \"/icon-512.png\",\n"
                                          "      \"sizes\": \"512x512\",\n"
                                          "      \"type\": \"image/png\",\n"
                                          "      \"purpose\": \"any maskable\"\n"
                                          "    },\n"
                                          "    {\n"
                                          "      \"src\": \"/icon.svg\",\n"
                                          "      \"sizes\": \"any\",\n"
                                          "      \"type\": \"image/svg+xml\"\n"
                                          "    }\n"
                                          "  ]\n"
                                          "}";
                    NSData *bodyData = [manifest dataUsingEncoding:NSUTF8StringEncoding];
                    NSString *header = [NSString stringWithFormat:
                                       @"HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Cache-Control: no-cache\r\n"
                                       "Content-Type: application/manifest+json; charset=utf-8\r\n"
                                       "Content-Length: %lu\r\n\r\n", (unsigned long)bodyData.length];
                    write_all(client_fd, [header UTF8String], strlen([header UTF8String]));
                    write_all(client_fd, [bodyData bytes], bodyData.length);
                } else if ([request containsString:@"/sw.js"]) {
                    NSString *home = NSHomeDirectory();
                    NSString *path = [home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/simple-streamer/sw.js"];
                    NSData *swData = [NSData dataWithContentsOfFile:path];
                    if (!swData) {
                        swData = [NSData dataWithContentsOfFile:@"/Users/mahdi/Business/simple-streamer/dock/sw.js"];
                    }
                    if (swData) {
                        NSString *header = [NSString stringWithFormat:
                                           @"HTTP/1.1 200 OK\r\n"
                                           "Access-Control-Allow-Origin: *\r\n"
                                           "Access-Control-Allow-Private-Network: true\r\n"
                                           "Cache-Control: no-cache, no-store, must-revalidate\r\n"
                                           "Content-Type: application/javascript; charset=utf-8\r\n"
                                           "Content-Length: %lu\r\n\r\n", (unsigned long)swData.length];
                        write_all(client_fd, [header UTF8String], strlen([header UTF8String]));
                        write_all(client_fd, [swData bytes], swData.length);
                    } else {
                        const char *resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 13\r\n\r\n404 Not Found";
                        write_all(client_fd, resp, strlen(resp));
                    }
                } else if ([request containsString:@"/icon-192.png"]) {
                    NSString *home = NSHomeDirectory();
                    NSString *path = [home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/simple-streamer/icon-192.png"];
                    NSData *imgData = [NSData dataWithContentsOfFile:path];
                    if (!imgData) {
                        imgData = [NSData dataWithContentsOfFile:@"/Users/mahdi/Business/simple-streamer/dock/icon-192.png"];
                    }
                    if (imgData) {
                        NSString *header = [NSString stringWithFormat:
                                           @"HTTP/1.1 200 OK\r\n"
                                           "Access-Control-Allow-Origin: *\r\n"
                                           "Access-Control-Allow-Private-Network: true\r\n"
                                           "Cache-Control: public, max-age=86400\r\n"
                                           "Content-Type: image/png\r\n"
                                           "Content-Length: %lu\r\n\r\n", (unsigned long)imgData.length];
                        write_all(client_fd, [header UTF8String], strlen([header UTF8String]));
                        write_all(client_fd, [imgData bytes], imgData.length);
                    } else {
                        const char *resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 13\r\n\r\n404 Not Found";
                        write_all(client_fd, resp, strlen(resp));
                    }
                } else if ([request containsString:@"/icon-512.png"]) {
                    NSString *home = NSHomeDirectory();
                    NSString *path = [home stringByAppendingPathComponent:@"Library/Application Support/obs-studio/plugin_config/simple-streamer/icon-512.png"];
                    NSData *imgData = [NSData dataWithContentsOfFile:path];
                    if (!imgData) {
                        imgData = [NSData dataWithContentsOfFile:@"/Users/mahdi/Business/simple-streamer/dock/icon-512.png"];
                    }
                    if (imgData) {
                        NSString *header = [NSString stringWithFormat:
                                           @"HTTP/1.1 200 OK\r\n"
                                           "Access-Control-Allow-Origin: *\r\n"
                                           "Access-Control-Allow-Private-Network: true\r\n"
                                           "Cache-Control: public, max-age=86400\r\n"
                                           "Content-Type: image/png\r\n"
                                           "Content-Length: %lu\r\n\r\n", (unsigned long)imgData.length];
                        write_all(client_fd, [header UTF8String], strlen([header UTF8String]));
                        write_all(client_fd, [imgData bytes], imgData.length);
                    } else {
                        const char *resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 13\r\n\r\n404 Not Found";
                        write_all(client_fd, resp, strlen(resp));
                    }
                } else if ([request containsString:@"/icon.svg"]) {
                    NSString *svg = @"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\">"
                                     "<rect width=\"512\" height=\"512\" rx=\"128\" fill=\"#0d0f12\"/>"
                                     "<circle cx=\"256\" cy=\"256\" r=\"160\" fill=\"none\" stroke=\"#2563eb\" stroke-width=\"24\"/>"
                                     "<circle cx=\"256\" cy=\"256\" r=\"90\" fill=\"none\" stroke=\"#3b82f6\" stroke-width=\"24\"/>"
                                     "<circle cx=\"256\" cy=\"256\" r=\"40\" fill=\"#ef4444\"/>"
                                     "<path d=\"M190 390 L256 340 L322 390\" stroke=\"#10b981\" stroke-width=\"20\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/>"
                                     "</svg>";
                    NSData *bodyData = [svg dataUsingEncoding:NSUTF8StringEncoding];
                    NSString *header = [NSString stringWithFormat:
                                       @"HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Cache-Control: public, max-age=86400\r\n"
                                       "Content-Type: image/svg+xml\r\n"
                                       "Content-Length: %lu\r\n\r\n", (unsigned long)bodyData.length];
                    write_all(client_fd, [header UTF8String], strlen([header UTF8String]));
                    write_all(client_fd, [bodyData bytes], bodyData.length);
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
                                       "Connection: close\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 15\r\n\r\n"
                                       "{\"status\":\"ok\"}";
                    write_all(client_fd, resp, strlen(resp));
                } else if (try_serve_static_file(client_fd, urlPath, isHead)) {
                    // Static file served successfully
                } else {
                    const char *resp = "HTTP/1.1 200 OK\r\n"
                                       "Access-Control-Allow-Origin: *\r\n"
                                       "Access-Control-Allow-Private-Network: true\r\n"
                                       "Connection: close\r\n"
                                       "Content-Type: application/json\r\n"
                                       "Content-Length: 15\r\n\r\n"
                                       "{\"status\":\"ok\"}";
                    write_all(client_fd, resp, strlen(resp));
                }
            }
            shutdown(client_fd, SHUT_WR);
            close(client_fd);
}

int main(int argc, char *argv[]) {
    @autoreleasepool {
        signal(SIGPIPE, SIG_IGN);

        int server_fd;
        struct sockaddr_in address;
        int opt = 1;

        if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
            return 1;
        }

        fcntl(server_fd, F_SETFD, FD_CLOEXEC);
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

        memset(&address, 0, sizeof(address));
        address.sin_len = sizeof(address);
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = htonl(INADDR_ANY);
        address.sin_port = htons(BRIDGE_PORT);

        if (bind(server_fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
            return 1;
        }

        if (listen(server_fd, 32) < 0) {
            return 1;
        }

        // Start background UDP discovery responder
        pthread_t udp_tid;
        if (pthread_create(&udp_tid, NULL, udp_discovery_thread, NULL) == 0) {
            pthread_detach(udp_tid);
        }

        // Start background mDNS / Bonjour supervisor
        pthread_t mdns_tid;
        if (pthread_create(&mdns_tid, NULL, mdns_supervisor_thread, NULL) == 0) {
            pthread_detach(mdns_tid);
        }

        while (1) {
            struct sockaddr_in client_addr;
            socklen_t client_len = sizeof(client_addr);
            int client_fd = accept(server_fd, (struct sockaddr *)&client_addr, &client_len);
            if (client_fd < 0) continue;

            dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
                @autoreleasepool {
                    handle_client(client_fd, client_addr);
                }
            });
        }
    }
    return 0;
}
