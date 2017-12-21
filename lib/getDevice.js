const BroadlinkJS = require('./broadlinkjs');
const broadlink = new BroadlinkJS()

const discoveredDevices = {};

const limit = 10;

let discovering = false;

const discoverDevices = (count = 0) => {
  discovering = true;

  if (count >= limit) {
    discovering = false;

    return;
  }

  broadlink.discover();
  count++;

  setTimeout(() => {
    discoverDevices(count);
  }, 3 * 1000)
}

discoverDevices();

broadlink.on('deviceReady', (device) => {
  const macAddressParts = device.mac.toString('hex').match(/[\s\S]{1,2}/g) || []
  const macAddress = macAddressParts.join(':')
  device.host.macAddress = macAddress

  if (discoveredDevices[device.host.address] || discoveredDevices[device.host.macAddress]) return;

  console.log(`Discovered Broadlink S1C device at ${device.host.address} (${device.host.macAddress})`)

  discoveredDevices[device.host.address] = device;
  discoveredDevices[device.host.macAddress] = device;
})

const getDevice = ({ host, log }) => {
  let device;

  if (host) {
    device = discoveredDevices[host];
  } else { // use the first one of no host is provided
    const hosts = Object.keys(discoveredDevices);
    if (hosts.length === 0) {
      log(`Send data (no devices found)`);
      if (!discovering) {
        log(`Attempting to discover S1C devices for 5s`);

        discoverDevices()
      }

      return
    }

      device = discoveredDevices[hosts[0]];

      if (!device) log(`Send data (no device found at ${host})`);
      if (!device && !discovering) {
        log(`Attempting to discover S1C devices for 5s`);

        discoverDevices()
      }
    }
  

  return device;
}

module.exports = getDevice;