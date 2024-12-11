const { ethers } = require('ethers');
const WebSocket = require('ws');
const fs = require("fs");


const WEBSOCKET_BACKOFF_BASE = 100;
const WEBSOCKET_BACKOFF_CAP = 30000;
const WEBSOCKET_PING_INTERVAL = 10000;
const WEBSOCKET_PONG_TIMEOUT = 5000;

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const WebSocketProviderClass = () => (class { });

class WebSocketProvider extends WebSocketProviderClass() {
  constructor(providerUrl) {
    super();
    this.providerUrl = providerUrl;
    this.attempts = 0;
    this.destroyed = false;
    this.events = [];
    this.requests = {};
    this.provider = undefined;
    this.create();
    return new Proxy(this, this.handler);
  }

  get handler() {
    return {
      get: (target, prop, receiver) => {
        if (target[prop]) return target[prop];
        const value = target.provider && Reflect.get(target.provider, prop, receiver);
        return value instanceof Function ? value.bind(target.provider) : value;
      }
    };
  }

  create() {
    if (this.provider) {
      this.events = [...this.events, ...this.provider._events];
      this.requests = { ...this.requests, ...this.provider._requests };
    }

    const webSocket = new WebSocket(this.providerUrl);
    const provider = new ethers.providers.WebSocketProvider(webSocket, this.provider?.network);
    let pingInterval;
    let pongTimeout;

    webSocket.on('open', () => {
      console.info('WebSocket open 1:', this.providerUrl, Date.now());
      this.attempts = 0;
      
      pingInterval = setInterval(() => {
        webSocket.ping();
        pongTimeout = setTimeout(() => {
          webSocket.terminate();
        }, WEBSOCKET_PONG_TIMEOUT);
      }, WEBSOCKET_PING_INTERVAL);
      
      let event;
      while ((event = this.events.pop())) {
        provider._events.push(event);
        provider._startEvent(event);
      }
      
      for (const key in this.requests) {
        provider._requests[key] = this.requests[key];
        webSocket.send(this.requests[key].payload);
        delete this.requests[key];
      }
      console.info('WebSocket open 2:', this.providerUrl, Date.now());
    });

    webSocket.on('error', (err) => {
      console.error('WebSocket error: %s', err.message);
    });

    webSocket.on('pong', () => {
      // console.info('WebSocket pong 1:', this.providerUrl, Date.now());
      if (pongTimeout) {
        let websocketTimestamp = {};
        // Read existing events from JSON file if it exists
        if (fs.existsSync("data/websocket.json")) {
          websocketTimestamp = JSON.parse(fs.readFileSync("data/websocket.json"));
          websocketTimestamp[this.providerUrl] = Date.now()
          fs.writeFileSync("data/websocket.json", JSON.stringify(websocketTimestamp, null, 2));
        }
        // console.info('WebSocket pong 2:', this.providerUrl, Date.now());
        clearTimeout(pongTimeout);
      }
    });
    
    webSocket.on('close', () => {
      console.info('WebSocket close 1:', this.providerUrl, Date.now());
      provider._wsReady = false;
      
      if (pingInterval) clearInterval(pingInterval);
      if (pongTimeout) clearTimeout(pongTimeout);
      
      if (!this.destroyed) {
        const sleep = getRandomInt(0, Math.min(WEBSOCKET_BACKOFF_CAP, WEBSOCKET_BACKOFF_BASE * 2 ** this.attempts++));
        this.timeout = setTimeout(() => this.create(), sleep);
      }
      console.info('WebSocket close 2:', this.providerUrl, Date.now());
    });

    this.provider = provider;
  }

  async destroy() {
    this.destroyed = true;
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    if (this.provider) {
      await this.provider.destroy();
    }
  }
}

module.exports = WebSocketProvider;

