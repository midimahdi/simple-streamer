/**
 * Minimalist, Zero-Dependency OBS WebSocket v5 Client.
 * Implements native browser WebSocket + Web Crypto SHA-256 authentication.
 */

export class ObsWebSocketClient {
  constructor() {
    this.ws = null;
    this.requestIdCounter = 1;
    this.pendingRequests = new Map();
    this.eventListeners = new Map();
    this.isConnected = false;
    this.isIdentified = false;
  }

  /**
   * Connect to OBS WebSocket v5 server.
   * @param {string} url e.g. "ws://127.0.0.1:4455"
   * @param {string} [password]
   * @returns {Promise<void>}
   */
  async connect(url = 'ws://127.0.0.1:4455', password = '') {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
    }

    return new Promise((resolve, reject) => {
      let resolved = false;

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        return reject(new Error(`WebSocket initialization failed: ${err.message}`));
      }

      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          try { this.ws.close(); } catch (_) {}
          reject(new Error('Connection to OBS timed out (5s). Is OBS open?'));
        }
      }, 5000);

      this.ws.onopen = () => {
        this.isConnected = true;
      };

      this.ws.onerror = (err) => {
        if (!resolved) {
          clearTimeout(connectionTimeout);
          resolved = true;
          reject(new Error('Cannot reach OBS WebSocket on port 4455. Is OBS open?'));
        }
        this.emit('error', err);
      };

      this.ws.onclose = (event) => {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.isIdentified = false;

        if (!resolved) {
          clearTimeout(connectionTimeout);
          resolved = true;
          if (event && (event.code === 4009 || event.code === 4008)) {
            reject(new Error('Authentication failed: Invalid OBS WebSocket password.'));
          } else {
            reject(new Error(`Connection closed before handshake (code ${event ? event.code : 'unknown'}).`));
          }
        }

        if (wasConnected) {
          this.emit('disconnected');
        }
      };

      this.ws.onmessage = async (msgEvent) => {
        try {
          const msg = JSON.parse(msgEvent.data);
          const op = msg.op;
          const d = msg.d;

          // OpCode 0: Hello from OBS
          if (op === 0) {
            let authResponse = undefined;

            if (d.authentication) {
              if (!password) {
                clearTimeout(connectionTimeout);
                resolved = true;
                this.ws.close();
                return reject(new Error('OBS requires a WebSocket password. Set it in Diagnostics.'));
              }

              const salt = d.authentication.salt;
              const challenge = d.authentication.challenge;

              // Step 1: base64(sha256(password + salt))
              const secret = await this._sha256Base64(password + salt);
              // Step 2: base64(sha256(secret + challenge))
              authResponse = await this._sha256Base64(secret + challenge);
            }

            // OpCode 1: Identify
            const identifyMsg = {
              op: 1,
              d: {
                rpcVersion: 1,
                eventSubscriptions: 1023, // General, Scenes, Outputs, Vendors (CustomEvent)
              },
            };
            if (authResponse) {
              identifyMsg.d.authentication = authResponse;
            }

            this.ws.send(JSON.stringify(identifyMsg));
          }

          // OpCode 2: Identified
          else if (op === 2) {
            clearTimeout(connectionTimeout);
            this.isIdentified = true;
            resolved = true;
            this.emit('connected');
            resolve();
          }

          // OpCode 7: RequestResponse
          else if (op === 7) {
            const reqId = d.requestId;
            if (this.pendingRequests.has(reqId)) {
              const { reqResolve, reqReject } = this.pendingRequests.get(reqId);
              this.pendingRequests.delete(reqId);

              if (d.requestStatus && d.requestStatus.result) {
                reqResolve(d.responseData || {});
              } else {
                const comment = d.requestStatus?.comment || 'OBS request failed';
                const code = d.requestStatus?.code || 0;
                reqReject(new Error(`OBS Error (${code}): ${comment}`));
              }
            }
          }

          // OpCode 5: Event
          else if (op === 5) {
            this.emit('event', d);
            if (d.eventType) {
              this.emit(d.eventType, d.eventData);
            }
          }
        } catch (parseErr) {
          console.error('[OBS WS Client] Message parse error:', parseErr);
        }
      };
    });
  }

  /**
   * Execute an OBS WebSocket v5 request.
   * @param {string} requestType e.g. 'StartStream', 'SetStreamServiceSettings'
   * @param {Object} [requestData]
   * @returns {Promise<any>}
   */
  async call(requestType, requestData = {}) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('OBS WebSocket is disconnected.');
    }

    const requestId = String(this.requestIdCounter++);
    const payload = {
      op: 6,
      d: {
        requestType,
        requestId,
        requestData,
      },
    };

    return new Promise((reqResolve, reqReject) => {
      this.pendingRequests.set(requestId, { reqResolve, reqReject });
      this.ws.send(JSON.stringify(payload));

      // Timeout for individual requests
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reqReject(new Error(`OBS Request "${requestType}" timed out (8s)`));
        }
      }, 8000);
    });
  }

  /**
   * Event listener management.
   */
  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  emit(event, data) {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.forEach((h) => {
        try { h(data); } catch (e) { console.error(e); }
      });
    }
  }

  disconnect() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.isIdentified = false;
  }

  async _sha256Base64(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(hash);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
