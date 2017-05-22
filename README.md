# homebridge-broadlink-s1c

Broadlink S1C plugin for [Homebridge](https://github.com/nfarina/homebridge/).
This plugins only reads the status of the current sensors.
no ability to control the alarm state (yet).

Inspired and forked from [homebridge-broadlink-platform](https://github.com/smka/homebridge-broadlink-platform) By [@smka](https://github.com/smka)

# Installation
0. Config your S1C device  and sensors with default e-Control app (for the first time)
1. Install homebridge using: `(sudo) npm install -g homebridge`
2. Install this plugin using: `(sudo) npm install -g homebridge-broadlink-s1c`
3. Update your configuration file. See example: `config-sample.json`.
4. Now you can read your window/door sensors status using homebridge, homekit and siri.
