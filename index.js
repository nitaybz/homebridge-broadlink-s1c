var Service, Characteristic;
var broadlink = require('broadlinkjs-s1c');
var async = require("async")

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
    this.motionTimeout = config.motionTimeout || 30;
    this.nightMode = config.nightMode || "part_arm";
    this.awayMode = config.awayMode || "full_arm";
    this.stayMode = config.stayMode || "disarm";
    this.triggered = false;
    this.alarmStatus = Characteristic.SecuritySystemCurrentState.DISARMED;

    if (api) {
        this.api = api;
    }

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

    this.checkAllInterval = function(){
        var self = this;
        var b = new broadlink();
        b.discover();
        b.on("deviceReady", (dev) => {
            if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                async.waterfall([
                    function(callback){
                        dev.get_sensors_status();
                        dev.on("sensors_status", (status_array) => {
                            self.sensors = status_array["sensors"];
                            self.count = status_array["count"];
                            callback (null)
                        });
                    }, 
                    function(callback){
                        dev.get_trigger_status();
                        dev.on("triggerd_status", (triggered) => {
                                callback (null, triggered)
                        });
                    }, 
                    function(triggered, callback){
                        if (!triggered){
                            dev.get_alarm_status();
                            dev.on("alarm_status", (status) => {
                                switch (status) {
                                    case "Full-Arm":
                                        if (self.nightMode == "full_arm"){
                                            self.alarmStatus = Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
                                        } else if (self.stayMode == "full_arm"){
                                            self.alarmStatus = Characteristic.SecuritySystemCurrentState.STAY_ARM;
                                        } else if (self.awayMode == "full_arm"){
                                            self.alarmStatus = Characteristic.SecuritySystemCurrentState.AWAY_ARM;
                                        }
                                        break;
                                    case "Part-Arm":
                                        if (self.nightMode == "part_arm"){
                                            self.alarmStatus = Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
                                        } else if (self.stayMode == "part_arm"){
                                            self.alarmStatus = Characteristic.SecuritySystemCurrentState.STAY_ARM;
                                        } else if (self.awayMode == "part_arm"){
                                            self.alarmStatus = Characteristic.SecuritySystemCurrentState.AWAY_ARM;
                                        }
                                        break;
                                    case "Cancel Alarm":
                                        self.alarmStatus = Characteristic.SecuritySystemCurrentState.DISARMED;
                                        break;
                                };
                                callback (null, "done")      
                            });
                        } else {
                            self.alarmStatus = Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
                            callback (null, "done")
                        }
                        
                    }
                ], function (err, result){
                        if (result !== "done") {
                            self.log(err)
                        }
                        dev.exit();
                    }
                )
            } else {
                dev.exit();
            }
        });
    }
    var self = this;
    self.refreshAll = setInterval(function(){
        self.checkAllInterval();
    }, 2000);

}

broadlinkS1C.prototype = {
    accessories: function(callback) {
        //For each device in cfg, create an accessory!
        var myAccessories = [];
        var b = new broadlink();
        b.on("deviceReady", (dev) => {
            if (dev.type == "S1C" && (this.mac_buff(this.mac).equals(dev.mac) || dev.host.address == this.ip)) {
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
                            foundSensor.motionTimeout = this.motionTimeout
                            var accessory = new BroadlinkSensor(this.log, foundSensor, this);
                            myAccessories.push(accessory);
                            this.log('Created ' + this.name + "  - " + foundSensor.type +' Named: ' + foundSensor.sensorName);
                        }
                    }
                    var hostConfig = {};
                    hostConfig.name = this.name
                    hostConfig.ip = this.ip;
                    hostConfig.mac = this.mac;
                    hostConfig.alarmSound = this.config.alarmSound || true;
                    hostConfig.notificationSound = this.config.notificationSound || false;
                    var hostAccessory = new BroadlinkHost(this.log, hostConfig, this);
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
        }, 2000);
        
    }
}
function BroadlinkHost(log, config, platform) {
    this.log = log;
    this.config = config;
    this.name = config.name;
    this.ip = config.ip;
    this.mac = config.mac;
    this.platform = platform
    this.nightMode = config.nightMode || "part_arm";
    this.awayMode = config.awayMode || "full_arm";
    this.stayMode = config.stayMode || "disarm";
    this.lastReportedStatus = Characteristic.SecuritySystemCurrentState.DISARMED;
    this.alarmSound = config.alarmSound || true;
    this.notificationSound = config.notificationSound || false;
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
        .on('get', this.getCurrentState.bind(this));

    this.securityService
        .getCharacteristic(Characteristic.SecuritySystemTargetState)
        .on('get', this.getTargetState.bind(this))
        .on('set', this.setTargetState.bind(this));
        
    this.statusCheck = function(){
        var self = this;
        var newStatus = platform.alarmStatus;
        if (self.lastReportedStatus !== newStatus) {
            self.lastReportedStatus = newStatus;
            this.log("State Changed to " + self.lastReportedStatus);
            self.securityService.getCharacteristic(Characteristic.SecuritySystemCurrentState).setValue(self.lastReportedStatus);
            self.securityService.getCharacteristic(Characteristic.SecuritySystemTargetState).setValue(self.lastReportedStatus);
        }
    };
    
    var self = this;
    self.statusCheck();
    self.timer = setInterval(function(){
        self.statusCheck();
    }, 3000);

}

BroadlinkHost.prototype = {
    getServices: function() {
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Broadlink SmartOne')
            .setCharacteristic(Characteristic.Model, "S1C")
        
        return [this.securityService, informationService];
    },
    identify: function(callback) {
	this.log("Identify requested!");
	callback(); // success
    },

    getState: function(callback, command) {
    var self = this;
	if (command == "current"){
            callback(null, self.lastReportedStatus);
        } else if (command == "target"){
            if (self.lastReportedStatus == Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED){
                callback(null);
            }else {
                callback(null, self.lastReportedStatus);
            }
        }
    },
    
    getCurrentState: function(callback) {
        this.log("Getting current state");
        this.getState(callback, "current");
    },

    getTargetState: function(callback) {
        this.log("Getting target state");
        this.getState(callback, "target");
    },
    
    setTargetState: function (state, callback){
        var self = this;
        var platform = self.platform;
        var b = new broadlink();
        b.discover();
        b.on("deviceReady", (dev) => {
            if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                clearInterval(checkAgain);
                switch (state) {
                    case Characteristic.SecuritySystemTargetState.STAY_ARM:
                        dev.set_state(self.stayMode, self.notificationSound, self.alarmSound);
                        self.log("Setting State to " + self.stayMode)
                        self.lastReportedStatus = Characteristic.SecuritySystemTargetState.STAY_ARM;
                        break;
                    case Characteristic.SecuritySystemTargetState.AWAY_ARM:
                        dev.set_state(self.awayMode, self.notificationSound, self.alarmSound);
                        self.log("Setting State to " + self.awayMode)
                        self.lastReportedStatus = Characteristic.SecuritySystemTargetState.AWAY_ARM;
                        break;
                    case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
                        dev.set_state(self.nightMode, self.notificationSound, self.alarmSound);
                        self.log("Setting State to " + self.nightMode)
                        self.lastReportedStatus = Characteristic.SecuritySystemTargetState.NIGHT_ARM;
                        break;
                    case Characteristic.SecuritySystemTargetState.DISARM:
                        dev.set_state("disarm", self.notificationSound, self.alarmSound);
                        self.log("Setting State to Cancel Alarm (Disarm)")
                        self.lastReportedStatus = Characteristic.SecuritySystemTargetState.DISARM;
                        break;
                };
                platform.alarmStatus = self.lastReportedStatus
                dev.exit();
                self.securityService.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
                callback(null, state);
            } else {
                dev.exit();
            }
        });

        var checkAgain = setInterval(function() {
            b.discover();
        }, 2000)
    }
}

function BroadlinkSensor(log, config, platform) {
    this.log = log;
    this.config = config;
    this.serial = config.serial || "";
    this.type = config.type;
    this.name = config.sensorName;
    this.ip = config.ip;
    this.mac = config.mac;
    this.detected = false;
    this.motionTimeout = config.motionTimeout;

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
        for (var i=0; i<platform.count; i++){
            if (self.serial == platform.sensors[i].serial){
                lastDetected = self.detected;
                self.detected = (platform.sensors[i].status == 1 ? true : false);
                if (self.type == "Motion Sensor" && self.detected !== lastDetected) {
                    self.log(self.name + " state is - " + (self.detected ? "Person Detected" : "No Person"));
                    self.service.getCharacteristic(Characteristic.MotionDetected).setValue(self.detected, undefined);
                    clearInterval(self.timer);
                    setTimeout(function(){
                        self.detected = false;
                        self.service.getCharacteristic(Characteristic.MotionDetected).setValue(self.detected, undefined);
                        self.timer = setInterval(function(){
                            self.intervalCheck();
                        }, 2000); 
                    }, self.motionTimeout*1000)
                } else if (self.type == "Door Sensor" && self.detected !== lastDetected) {
                    self.log(self.name + " state is - " + (self.detected ? "Open" : "Close"));
                    self.service.getCharacteristic(Characteristic.ContactSensorState).setValue(platform.sensors[i].status == 1 ?
                        Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
                }
            }
        }
    };

    var self = this;
    self.timer = setInterval(function(){
        self.intervalCheck();
    }, 1000);
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
