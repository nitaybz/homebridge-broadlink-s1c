var Service, Characteristic;
var async = require("async")
var broadlink = require('./lib/broadlinkjs');

const getDevice = require('./lib/getDevice');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    //UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform("homebridge-broadlink-s1c", "broadlinkS1C", broadlinkS1C);
}

function broadlinkS1C(log, config, api) {
    var self = this;
    this.log = log;
    this.config = config;
    this.name = config.name;
    this.ip = config.ip;
    this.mac = config.mac;
    this.motionTimeout = config.motionTimeout || 30;
    this.nightMode = config.nightMode || "part_arm";
    this.awayMode = config.awayMode || "full_arm";
    this.stayMode = config.stayMode || "disarm";
    this.alarmStatus = Characteristic.SecuritySystemCurrentState.DISARMED;
    if (!this.ip && !this.mac) throw new Error("You must provide a config value for 'ip' or 'mac'.");

    if (api) {
        this.api = api;
    }

    this.checkAllInterval = function(){
        var self = this;
        var host = this.ip || this.mac
        var log = this.log
        this.device = getDevice({ host, log })
        if (this.device !== undefined){
            async.waterfall([
                function(callback){
                    self.device.get_sensors_status(function(status_array){
                        self.sensors = status_array["sensors"];
                        self.count = status_array["count"];
                        callback()
                    });
                }, 
                function(callback){
                    self.device.get_trigger_status(function(triggered){
                        callback(null, triggered)
                    });
                }, 
                function(triggered, callback){
                    if (!triggered){
                        self.device.get_alarm_status(function(status){
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
                }
            )
        }
    }
    
    self.refreshAll = setInterval(function(){
        self.checkAllInterval();
    }, 1000);

}

broadlinkS1C.prototype = {
    accessories: function(callback) {
        //For each device in cfg, create an accessory!
        var myAccessories = [];

        var self = this;
        var host = this.ip || this.mac
        var log = this.log
        this.device = getDevice({ host, log })
        var counter = 0;
        if (this.device == undefined && counter < 10){
            counter++
            this.log("Searching for S1C device... Please Wait!")
            setTimeout(function(){
                self.accessories(callback)
            }, 3000)
        } else if (this.device == undefined && counter >= 10){
            var err = new Error("Could not find S1C device at " + host + " !")
            self.log(err)
            callback(err, null)
        } else {
            this.device.get_sensors_status(function(status_array){
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
                            self.log('Created ' + this.name + "  - " + foundSensor.type +' Named: ' + foundSensor.sensorName);
                        }
                    }
                    var hostConfig = {};
                    hostConfig.name = this.name
                    hostConfig.ip = this.ip;
                    hostConfig.mac = this.mac;
                    hostConfig.alarmSound = this.config.alarmSound || true;
                    hostConfig.notificationSound = this.config.notificationSound || false;
                    hostConfig.nightMode = this.nightMode;
                    hostConfig.awayMode = this.awayMode;
                    hostConfig.stayMode = this.stayMode;
                    var hostAccessory = new BroadlinkHost(this.log, hostConfig, this);
                    myAccessories.push(hostAccessory);
                    callback(myAccessories);
            });
        }
    }
}

function BroadlinkHost(log, config, platform) {
    this.log = log;
    this.config = config;
    this.name = config.name;
    this.ip = config.ip;
    this.mac = config.mac;
    this.platform = platform
    this.nightMode = config.nightMode;
    this.awayMode = config.awayMode;
    this.stayMode = config.stayMode;
    this.lastReportedStatus = Characteristic.SecuritySystemCurrentState.DISARMED;
    this.alarmSound = config.alarmSound || true;
    this.notificationSound = config.notificationSound || false;


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
            self.securityService.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(self.lastReportedStatus);
            self.securityService.getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(self.lastReportedStatus);
        }
    };
    
    var self = this;
    self.statusCheck();
    self.timer = setInterval(function(){
        self.statusCheck();
    }, 2000);

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
        var platform = self.platform;
        var host = this.ip || this.mac
        var log = this.log
        this.device = getDevice({ host, log })
        var counter = 0;
        if (this.device == undefined && counter < 10){
            counter++
            this.log("Searching for S1C device... Please Wait!")
            setTimeout(function(){
                self.setTargetState(state, callback)
            }, 3000)
        } else if (this.device == undefined && counter >= 10){
            var err = new Error("Could not find S1C at " + host + " !")
            self.log(err)
            callback(err, null)
        } else {
            switch (state) {
                case Characteristic.SecuritySystemTargetState.STAY_ARM:
                    self.device.set_state(self.stayMode, self.notificationSound, self.alarmSound);
                    self.log("Setting State to " + self.stayMode)
                    self.lastReportedStatus = Characteristic.SecuritySystemTargetState.STAY_ARM;
                    break;
                case Characteristic.SecuritySystemTargetState.AWAY_ARM:
                    self.device.set_state(self.awayMode, self.notificationSound, self.alarmSound);
                    self.log("Setting State to " + self.awayMode)
                    self.lastReportedStatus = Characteristic.SecuritySystemTargetState.AWAY_ARM;
                    break;
                case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
                    self.device.set_state(self.nightMode, self.notificationSound, self.alarmSound);
                    self.log("Setting State to " + self.nightMode)
                    self.lastReportedStatus = Characteristic.SecuritySystemTargetState.NIGHT_ARM;
                    break;
                case Characteristic.SecuritySystemTargetState.DISARM:
                    self.device.set_state("disarm", self.notificationSound, self.alarmSound);
                    self.log("Setting State to Cancel Alarm (Disarm)")
                    self.lastReportedStatus = Characteristic.SecuritySystemTargetState.DISARM;
                    break;
            };
            platform.alarmStatus = self.lastReportedStatus
            self.securityService.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
            callback(null, state);
        }
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
                    self.service.getCharacteristic(Characteristic.MotionDetected).updateValue(self.detected, undefined);
                    clearInterval(self.timer);
                    setTimeout(function(){
                        self.detected = false;
                        self.service.getCharacteristic(Characteristic.MotionDetected).updateValue(self.detected, undefined);
                        self.timer = setInterval(function(){
                            self.intervalCheck();
                        }, 1000); 
                    }, self.motionTimeout*1000)
                } else if (self.type == "Door Sensor" && self.detected !== lastDetected) {
                    self.log(self.name + " state is - " + (self.detected ? "Open" : "Close"));
                    self.service.getCharacteristic(Characteristic.ContactSensorState).updateValue(platform.sensors[i].status == 1 ?
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
