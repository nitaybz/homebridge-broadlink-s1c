var Service, Characteristic;
var broadlink = require('broadlinkjs-s1c');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    //UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform("homebridge-broadlink-s1c", "broadlinkS1C", broadlinkS1C);
}

function broadlinkS1C(log, config, api) {
    this.log = log;
    this.config = config;
    this.name = config.name;
    this.ip = config.ip;
    this.mac = config.mac;
    if (api) {
        this.api = api;
    }

}

broadlinkS1C.prototype = {
    accessories: function(callback) {
        //For each device in cfg, create an accessory!
        var myAccessories = [];
        var b = new broadlink();
        b.on("deviceReady", (dev) => {
            if (dev.type == "S1C") {
                this.log("S1C Detected");
                dev.get_sensors_status();
                dev.on("sensors_status", (status_array) => {
                    dev.exit();
                    clearInterval(refresh);
                    var count = status_array["count"];
                    var sensors = status_array["sensors"];
                    for (var i = 0; i < count; i++) {
                        if ((sensors[i].type == "Motion Sensor") || (sensors[i].type ==  "Door Sensor")) {
                            var foundSensor = {};
                            foundSensor.sensorName = sensors[i].name;
                            foundSensor.serial = sensors[i].serial;
                            foundSensor.type = sensors[i].type;
                            foundSensor.ip = this.ip;
                            foundSensor.mac = this.mac;
                            var accessory = new BroadlinkSensor(this.log, foundSensor);
                            myAccessories.push(accessory);
                            this.log('Created ' + foundSensor.accessoryName + "  - " + foundSensor.type +' Named: ' + foundSensor.sensorName);
                        }
                    }
                    var hostConfig = {};
                    hostConfig.name = this.name
                    hostConfig.ip = this.ip;
                    hostConfig.mac = this.mac;
                    var hostAccessory = new BroadlinkHost(this.log, hostConfig);
                    myAccessories.push(hostAccessory);
                    callback(myAccessories);
                });
            } else {
                console.log(dev.type + "@" + dev.host.address + " found... not S1C!");
                dev.exit();
            }
        });
        var refresh = setInterval(function(){
            b.discover();
        }, 1000);
        
    }
}
function BroadlinkHost(log, config) {
    this.log = log;
    this.config = config;
    this.name = config.name;
    this.ip = config.ip;
    this.mac = config.mac;
    this.alarmStatus = 3;
    if (!this.ip && !this.mac) throw new Error("You must provide a config value for 'ip' or 'mac'.");
    // MAC string to MAC buffer
    this.mac_buff = function(mac) {
        var mb = new Buffer(6);
        if (mac) {
            var values = mac.split(':');
            if (!values || values.length !== 6) {
                throw new Error('Invalid MAC [' + mac + ']; should follow pattern ##:##:##:##:##:##');
            }
            for (var i = 0; i < values.length; ++i) {
                var tmpByte = parseInt(values[i], 16);
                mb.writeUInt8(tmpByte, i);
            }
        } else {
            //this.log("MAC address emtpy, using IP: " + this.ip);
        }
        return mb;
    }

    this.securityService = new Service.SecuritySystem(this.name);

    this.securityService
        .getCharacteristic(Characteristic.SecuritySystemCurrentState)
        .on('get', this.getState.bind(this));

    this.securityService
        .getCharacteristic(Characteristic.SecuritySystemTargetState)
        .on('get', this.getState.bind(this))
        .on('set', this.setTargetState.bind(this));

    this.statusCheck = function(){
        var self = this;
        var b = new broadlink();
        b.discover();

        b.on("deviceReady", (dev) => {
            if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                dev.get_alarm_status();
                dev.on("alarm_status", (status) => {
                    var lastStatus = self.alarmStatus;
                    switch (status) {
                        case "Full-Arm":
                            self.alarmStatus = 1;
                            break;
                        case "Part-Arm":
                            self.alarmStatus = 2;
                            break;
                        case "Cancel Alarm":
                            self.alarmStatus = 3;
                            break;
                        default:
                            status = null;
                            break;
                    };
                    dev.get_trigger_status();
                    dev.on("triggerd_status", (triggered) => {
                        if (triggered){
                            self.alarmStatus = 4;
                            self.log("Alarm is Triggered")
                        }
                        dev.exit();
                        if (lastStatus !== self.alarmStatus) {
                            console.log("State Changed to " + self.alarmStatus);
                            self.securityService.getCharacteristic(Characteristic.SecuritySystemCurrentState, self.alarmStatus);
                        }
                    });
                });
                
            } else {
                dev.exit();
            }
        });
    };
    
    var self = this;
    self.statusCheck();
    this.timer = setInterval(function(){
        self.statusCheck();
    }, 3000);

}

BroadlinkHost.prototype = {
    getServices: function() {
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Broadlink SmartOne')
            .setCharacteristic(Characteristic.Model, "S1C")
            .setCharacteristic(Characteristic.SerialNumber, "Host");
        
        return [this.securityService, informationService];
    },

    getState: function(callback) {
		callback(null, this.alarmStatus);
    },

    setTargetState: function (state, callback){
        var self = this;
        var b = new broadlink();
        b.discover();

        b.on("deviceReady", (dev) => {
            if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                clearInterval(checkAgain);

                switch (state) {
                    case Characteristic.SecuritySystemTargetState.STAY_ARM:
                        dev.set_state("disarm", false, false);
                        self.log("Setting State to Cancel Alarm")
                        self.alarmStatus = 0;
                        break;
                    case Characteristic.SecuritySystemTargetState.AWAY_ARM:
                        dev.set_state("full_arm", false, false);
                        self.log("Setting State to Full-Arm")
                        self.alarmStatus = 1;
                        break;
                    case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
                        dev.set_state("part_arm", false, false);
                        self.log("Setting State to Part-Arm")
                        self.alarmStatus = 2;
                        break;
                    case Characteristic.SecuritySystemTargetState.DISARM:
                        dev.set_state("disarm", false, false);
                        self.log("Setting State to Cancel Alarm")
                        self.alarmStatus = 3;
                        break;
                };
                dev.exit();
                self.securityService.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
                callback(null, state);
            } else {
                dev.exit();
            }
        });
        var checkAgain = setInterval(function() {
            b.discover();
        }, 1000)
    }
}

function BroadlinkSensor(log, config) {
    this.log = log;
    this.config = config;
    this.serial = config.serial || "";
    this.type = config.type;
    this.name = config.sensorName;
    this.ip = config.ip;
    this.mac = config.mac;
    this.detected = false;
    if (!this.ip && !this.mac) throw new Error("You must provide a config value for 'ip' or 'mac'.");
    var lastDetected;
    // MAC string to MAC buffer
    this.mac_buff = function(mac) {
        var mb = new Buffer(6);
        if (mac) {
            var values = mac.split(':');
            if (!values || values.length !== 6) {
                throw new Error('Invalid MAC [' + mac + ']; should follow pattern ##:##:##:##:##:##');
            }
            for (var i = 0; i < values.length; ++i) {
                var tmpByte = parseInt(values[i], 16);
                mb.writeUInt8(tmpByte, i);
            }
        } else {
            //this.log("MAC address emtpy, using IP: " + this.ip);
        }
        return mb;
    }
            
    if (this.type == "Motion Sensor"){
        console.log("Found Motion Sensor");
        this.service = new Service.MotionSensor(this.name);
        this.service
            .getCharacteristic(Characteristic.MotionDetected)
            .on('get', this.getState.bind(this));
    } else if (this.type == "Door Sensor"){
        console.log("Found Door sensor");
        this.service = new Service.ContactSensor(this.name);
    }
    this.intervalCheck = function(){
        var self = this;
        var b = new broadlink();
        b.discover();

        b.on("deviceReady", (dev) => {
            if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                dev.get_sensors_status();
                dev.on("sensors_status", (status_array) => {
                    var sensors = status_array["sensors"];
                    var count = status_array["count"];
                    dev.exit();
                    
                    for (var i=0; i<count; i++){
                        if (self.serial == sensors[i].serial){
                            lastDetected = self.detected;
                            self.detected = (sensors[i].status == 1 ? true : false);
                            if (sensors[i].type == "Motion Sensor" && self.detected !== lastDetected) {
                                self.log(self.name + " state is - " + (self.detected ? "Person Detected" : "No Person"));
                                self.service.getCharacteristic(Characteristic.MotionDetected).setValue(self.detected, undefined);
                            } else if (sensors[i].type == "Door Sensor" && self.detected !== lastDetected) {
                                self.log(self.name + " state is - " + (self.detected ? "Open" : "Close"));
                                self.service.getCharacteristic(Characteristic.ContactSensorState).setValue(sensors[i].status == 1 ?
				                    Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
                            }
                        }
                    }
                });
            } else {
                dev.exit();
            }
        });


    };
    var self = this;
    self.intervalCheck();
    this.timer = setInterval(function(){
        self.intervalCheck();
    }, 2000);

}

BroadlinkSensor.prototype = {
    getServices: function() {
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Broadlink S1C')
            .setCharacteristic(Characteristic.Model, this.type)
            .setCharacteristic(Characteristic.SerialNumber, this.serial);
        
        return [this.service, informationService];
    },

    getState: function(callback) {
		callback(null, this.detected);
    }
}
