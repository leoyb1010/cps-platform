const net = require('node:net');
const original = net.Socket.prototype.connect;
const local = host => !host || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase());
net.Socket.prototype.connect = function(...args) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const option = values[0];
  let host;
  if (option && typeof option === 'object') host = option.host || option.hostname;
  else if (typeof values[1] === 'string') host = values[1];
  if (!local(host)) throw new Error('Audit fixture blocked non-loopback network access');
  return original.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function(input, ...args) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!local(url.hostname)) return Promise.reject(new Error('Audit fixture blocked external fetch'));
  return originalFetch.call(this, input, ...args);
};
