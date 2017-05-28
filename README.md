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
4. Now you can read your window/door sensors status and control the host alarm states using homebridge, homekit and siri.


## Config file Sample

```
"platforms": [
    {
        "platform": "broadlinkS1C",
        "name": "S1C",
        "ip": "10.0.0.X",
        "stayMode": "disarm",
        "awayMode": "full_arm",
        "nightMode": "part_arm",
        "alarmSound": true,
        "notificationSound": false
    }
],
```

## Configuration

|             Parameter            |                       Description                             | Required |  Default  |
| -------------------------------- | ------------------------------------------------------------- |:--------:|:---------:|
| `platform`                       | always "broadlinkS1C"                                         |     ✓    |      -    |
| `name`                           | name of the Platform / Host                                   |     ✓    |      -    |
| `ip`                             | The ip address of the device. (use either ip or mac address)  |  or mac  |      -    |
| `mac`                            | The mac address of the device. (use either ip or mac address) |  or ip   |      -    |
| `stayMode`                       | "disarm" / "full_arm" / "part_arm"  On HomeKit Stay           |          | "disarm"  |
| `awayMode`                       | "disarm" / "full_arm" / "part_arm"  On HomeKit Away           |          | "full_arm"|
| `nightMode`                      | "disarm" / "full_arm" / "part_arm"  On HomeKit Night          |          | "part_arm"|
| `alarmSound`                     | true / false - set the alarm sound when triggered             |          |   true    |
| `useFanSpeed`                    | true / false - set the beep sound on sensors notification     |          |   false   |
