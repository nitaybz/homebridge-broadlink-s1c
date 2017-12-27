# homebridge-broadlink-s1c

Broadlink S1C plugin for [Homebridge](https://github.com/nfarina/homebridge/).
This plugins only reads the status of the current sensors.
no ability to control the alarm state (yet).

Inspired and forked from [homebridge-broadlink-platform](https://github.com/smka/homebridge-broadlink-platform) By [@smka](https://github.com/smka)


#### New version 3.0, should solve the `digital envelope routines:EVP_DecryptFinal` error and improve stability and response

_________________________________________
#### Creating and maintaining Homebridge plugins consume a lot of time and effort, if you would like to share your appreciation, feel free to "Star" or donate. 

<a target="blank" href="https://www.paypal.me/nitaybz"><img src="https://img.shields.io/badge/Donate-PayPal-blue.svg"/></a>
<a target="blank" href="https://blockchain.info/payment_request?address=18uuUZ5GaMFoRH5TrQFJATQgqrpXCtqZRQ"><img src="https://img.shields.io/badge/Donate-Bitcoin-green.svg"/></a>

[Click here](https://github.com/nitaybz?utf8=%E2%9C%93&tab=repositories&q=homebridge) to review more of my plugins.
_________________________________________

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
        "notificationSound": false,
        "motionTimeout": 30
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
| `motionTimeout`                  | Time in seconds of which motion sensor can be retriggered**   |          |    30     |

\*\* any vaue for the motionTimeout less than 30 seconds will be retriggered always since it's the minimum delay than can be set in the broadlink app, most recommeneded to set it for 30s delay instead of the default 6 minutes.
