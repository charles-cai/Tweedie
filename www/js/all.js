/*     PhoneGap v1.4.1 */
/*
       Licensed to the Apache Software Foundation (ASF) under one
       or more contributor license agreements.  See the NOTICE file
       distributed with this work for additional information
       regarding copyright ownership.  The ASF licenses this file
       to you under the Apache License, Version 2.0 (the
       "License"); you may not use this file except in compliance
       with the License.  You may obtain a copy of the License at

         http://www.apache.org/licenses/LICENSE-2.0

       Unless required by applicable law or agreed to in writing,
       software distributed under the License is distributed on an
       "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
       KIND, either express or implied.  See the License for the
       specific language governing permissions and limitations
       under the License.
*/


/*
 * Some base contributions
 * Copyright (c) 2011, Proyectos Equis Ka, S.L.
 */

if (typeof PhoneGap === "undefined") {

if (typeof(DeviceInfo) !== 'object'){
    DeviceInfo = {};
}
/**
 * This represents the PhoneGap API itself, and provides a global namespace for accessing
 * information about the state of PhoneGap.
 * @class
 */
PhoneGap = {
    // This queue holds the currently executing command and all pending
    // commands executed with PhoneGap.exec().
    commandQueue: [],
    // Indicates if we're currently in the middle of flushing the command
    // queue on the native side.
    commandQueueFlushing: false,
    _constructors: [],
    documentEventHandler: {},   // Collection of custom document event handlers
    windowEventHandler: {} 
};

/**
 * List of resource files loaded by PhoneGap.
 * This is used to ensure JS and other files are loaded only once.
 */
PhoneGap.resources = {base: true};

/**
 * Determine if resource has been loaded by PhoneGap
 *
 * @param name
 * @return
 */
PhoneGap.hasResource = function(name) {
    return PhoneGap.resources[name];
};

/**
 * Add a resource to list of loaded resources by PhoneGap
 *
 * @param name
 */
PhoneGap.addResource = function(name) {
    PhoneGap.resources[name] = true;
};

/**
 * Boolean flag indicating if the PhoneGap API is available and initialized.
 */ // TODO: Remove this, it is unused here ... -jm
PhoneGap.available = DeviceInfo.uuid != undefined;

/**
 * Add an initialization function to a queue that ensures it will run and initialize
 * application constructors only once PhoneGap has been initialized.
 * @param {Function} func The function callback you want run once PhoneGap is initialized
 */
PhoneGap.addConstructor = function(func) {
    var state = document.readyState;
    if ( ( state == 'loaded' || state == 'complete' ) && DeviceInfo.uuid != null )
    {
        func();
    }
    else
    {
        PhoneGap._constructors.push(func);
    }
};

(function() 
 {
    var timer = setInterval(function()
    {
                            
        var state = document.readyState;
                            
        if ( ( state == 'loaded' || state == 'complete' ) && DeviceInfo.uuid != null )
        {
            clearInterval(timer); // stop looking
            // run our constructors list
            while (PhoneGap._constructors.length > 0) 
            {
                var constructor = PhoneGap._constructors.shift();
                try 
                {
                    constructor();
                } 
                catch(e) 
                {
                    if (typeof(console['log']) == 'function')
                    {
                        console.log("Failed to run constructor: " + console.processMessage(e));
                    }
                    else
                    {
                        alert("Failed to run constructor: " + e.message);
                    }
                }
            }
            // all constructors run, now fire the deviceready event
            var e = document.createEvent('Events'); 
            e.initEvent('deviceready');
            document.dispatchEvent(e);
        }
    }, 1);
})();

// session id for calls
PhoneGap.sessionKey = 0;

// centralized callbacks
PhoneGap.callbackId = 0;
PhoneGap.callbacks = {};
PhoneGap.callbackStatus = {
    NO_RESULT: 0,
    OK: 1,
    CLASS_NOT_FOUND_EXCEPTION: 2,
    ILLEGAL_ACCESS_EXCEPTION: 3,
    INSTANTIATION_EXCEPTION: 4,
    MALFORMED_URL_EXCEPTION: 5,
    IO_EXCEPTION: 6,
    INVALID_ACTION: 7,
    JSON_EXCEPTION: 8,
    ERROR: 9
    };

/**
 * Creates a gap bridge iframe used to notify the native code about queued
 * commands.
 *
 * @private
 */
PhoneGap.createGapBridge = function() {
    gapBridge = document.createElement("iframe");
    gapBridge.setAttribute("style", "display:none;");
    gapBridge.setAttribute("height","0px");
    gapBridge.setAttribute("width","0px");
    gapBridge.setAttribute("frameborder","0");
    document.documentElement.appendChild(gapBridge);
    return gapBridge;
}

/** 
 * Execute a PhoneGap command by queuing it and letting the native side know
 * there are queued commands. The native side will then request all of the
 * queued commands and execute them.
 *
 * Arguments may be in one of two formats:
 *
 * FORMAT ONE (preferable)
 * The native side will call PhoneGap.callbackSuccess or
 * PhoneGap.callbackError, depending upon the result of the action.
 *
 * @param {Function} success    The success callback
 * @param {Function} fail       The fail callback
 * @param {String} service      The name of the service to use
 * @param {String} action       The name of the action to use
 * @param {String[]} [args]     Zero or more arguments to pass to the method
 *      
 * FORMAT TWO
 * @param {String} command    Command to be run in PhoneGap, e.g.
 *                            "ClassName.method"
 * @param {String[]} [args]   Zero or more arguments to pass to the method
 *                            object parameters are passed as an array object
 *                            [object1, object2] each object will be passed as
 *                            JSON strings 
 */
PhoneGap.exec = function() { 
    if (!PhoneGap.available) {
        alert("ERROR: Attempting to call PhoneGap.exec()"
              +" before 'deviceready'. Ignoring.");
        return;
    }

    var successCallback, failCallback, service, action, actionArgs;
    var callbackId = null;
    if (typeof arguments[0] !== "string") {
        // FORMAT ONE
        successCallback = arguments[0];
        failCallback = arguments[1];
        service = arguments[2];
        action = arguments[3];
        actionArgs = arguments[4];

        // Since we need to maintain backwards compatibility, we have to pass
        // an invalid callbackId even if no callback was provided since plugins
        // will be expecting it. The PhoneGap.exec() implementation allocates
        // an invalid callbackId and passes it even if no callbacks were given.
        callbackId = 'INVALID';
    } else {
        // FORMAT TWO
        splitCommand = arguments[0].split(".");
        action = splitCommand.pop();
        service = splitCommand.join(".");
        actionArgs = Array.prototype.splice.call(arguments, 1);
    }
    
    // Start building the command object.
    var command = {
        className: service,
        methodName: action,
        arguments: []
    };

    // Register the callbacks and add the callbackId to the positional
    // arguments if given.
    if (successCallback || failCallback) {
        callbackId = service + PhoneGap.callbackId++;
        PhoneGap.callbacks[callbackId] = 
            {success:successCallback, fail:failCallback};
    }
    if (callbackId != null) {
        command.arguments.push(callbackId);
    }

    for (var i = 0; i < actionArgs.length; ++i) {
        var arg = actionArgs[i];
        if (arg == undefined || arg == null) {
            continue;
        } else if (typeof(arg) == 'object') {
            command.options = arg;
        } else {
            command.arguments.push(arg);
        }
    }

    // Stringify and queue the command. We stringify to command now to
    // effectively clone the command arguments in case they are mutated before
    // the command is executed.
    PhoneGap.commandQueue.push(JSON.stringify(command));

    // If the queue length is 1, then that means it was empty before we queued
    // the given command, so let the native side know that we have some
    // commands to execute, unless the queue is currently being flushed, in
    // which case the command will be picked up without notification.
    if (PhoneGap.commandQueue.length == 1 && !PhoneGap.commandQueueFlushing) {
        /*if (!PhoneGap.gapBridge) {
            PhoneGap.gapBridge = PhoneGap.createGapBridge();
        }

        PhoneGap.gapBridge.src = "gap://ready";*/
        location = "gap://ready";
    }
}

/**
 * Called by native code to retrieve all queued commands and clear the queue.
 */
PhoneGap.getAndClearQueuedCommands = function() {
  json = JSON.stringify(PhoneGap.commandQueue);
  PhoneGap.commandQueue = [];
  return json;
}

/**
 * Called by native code when returning successful result from an action.
 *
 * @param callbackId
 * @param args
 *        args.status - PhoneGap.callbackStatus
 *        args.message - return value
 *        args.keepCallback - 0 to remove callback, 1 to keep callback in PhoneGap.callbacks[]
 */
PhoneGap.callbackSuccess = function(callbackId, args) {
    if (PhoneGap.callbacks[callbackId]) {

        // If result is to be sent to callback
        if (args.status == PhoneGap.callbackStatus.OK) {
            try {
                if (PhoneGap.callbacks[callbackId].success) {
                       PhoneGap.callbacks[callbackId].success(args.message);
                }
            }
            catch (e) {
                console.log("Error in success callback: "+callbackId+" = "+e);
            }
        }
    
        // Clear callback if not expecting any more results
        if (!args.keepCallback) {
            delete PhoneGap.callbacks[callbackId];
        }
    }
};

/**
 * Called by native code when returning error result from an action.
 *
 * @param callbackId
 * @param args
 */
PhoneGap.callbackError = function(callbackId, args) {
    if (PhoneGap.callbacks[callbackId]) {
        try {
            if (PhoneGap.callbacks[callbackId].fail) {
                PhoneGap.callbacks[callbackId].fail(args.message);
            }
        }
        catch (e) {
            console.log("Error in error callback: "+callbackId+" = "+e);
        }
        
        // Clear callback if not expecting any more results
        if (!args.keepCallback) {
            delete PhoneGap.callbacks[callbackId];
        }
    }
};


/**
 * Does a deep clone of the object.
 *
 * @param obj
 * @return
 */
PhoneGap.clone = function(obj) {
    if(!obj) { 
        return obj;
    }

    if(obj instanceof Array){
        var retVal = new Array();
        for(var i = 0; i < obj.length; ++i){
            retVal.push(PhoneGap.clone(obj[i]));
        }
        return retVal;
    }

    if (obj instanceof Function) {
        return obj;
    }

    if(!(obj instanceof Object)){
        return obj;
    }
    
    if (obj instanceof Date) {
        return obj;
    }

    retVal = new Object();
    for(i in obj){
        if(!(i in retVal) || retVal[i] != obj[i]) {
            retVal[i] = PhoneGap.clone(obj[i]);
        }
    }
    return retVal;
};

// Intercept calls to document.addEventListener 
PhoneGap.m_document_addEventListener = document.addEventListener;

// Intercept calls to window.addEventListener
PhoneGap.m_window_addEventListener = window.addEventListener;

/**
 * Add a custom window event handler.
 *
 * @param {String} event            The event name that callback handles
 * @param {Function} callback       The event handler
 */
PhoneGap.addWindowEventHandler = function(event, callback) {
    PhoneGap.windowEventHandler[event] = callback;
}

/**
 * Add a custom document event handler.
 *
 * @param {String} event            The event name that callback handles
 * @param {Function} callback       The event handler
 */
PhoneGap.addDocumentEventHandler = function(event, callback) {
    PhoneGap.documentEventHandler[event] = callback;
}

/**
 * Intercept adding document event listeners and handle our own
 *
 * @param {Object} evt
 * @param {Function} handler
 * @param capture
 */
document.addEventListener = function(evt, handler, capture) {
    var e = evt.toLowerCase();
           
    // If subscribing to an event that is handled by a plugin
    if (typeof PhoneGap.documentEventHandler[e] !== "undefined") {
        if (PhoneGap.documentEventHandler[e](e, handler, true)) {
            return; // Stop default behavior
        }
    }
    
    PhoneGap.m_document_addEventListener.call(document, evt, handler, capture); 
};

/**
 * Intercept adding window event listeners and handle our own
 *
 * @param {Object} evt
 * @param {Function} handler
 * @param capture
 */
window.addEventListener = function(evt, handler, capture) {
    var e = evt.toLowerCase();
        
    // If subscribing to an event that is handled by a plugin
    if (typeof PhoneGap.windowEventHandler[e] !== "undefined") {
        if (PhoneGap.windowEventHandler[e](e, handler, true)) {
            return; // Stop default behavior
        }
    }
        
    PhoneGap.m_window_addEventListener.call(window, evt, handler, capture);
};

// Intercept calls to document.removeEventListener and watch for events that
// are generated by PhoneGap native code
PhoneGap.m_document_removeEventListener = document.removeEventListener;

// Intercept calls to window.removeEventListener
PhoneGap.m_window_removeEventListener = window.removeEventListener;

/**
 * Intercept removing document event listeners and handle our own
 *
 * @param {Object} evt
 * @param {Function} handler
 * @param capture
 */
document.removeEventListener = function(evt, handler, capture) {
    var e = evt.toLowerCase();

    // If unsubcribing from an event that is handled by a plugin
    if (typeof PhoneGap.documentEventHandler[e] !== "undefined") {
        if (PhoneGap.documentEventHandler[e](e, handler, false)) {
            return; // Stop default behavior
        }
    }

    PhoneGap.m_document_removeEventListener.call(document, evt, handler, capture);
};

/**
 * Intercept removing window event listeners and handle our own
 *
 * @param {Object} evt
 * @param {Function} handler
 * @param capture
 */
window.removeEventListener = function(evt, handler, capture) {
    var e = evt.toLowerCase();

    // If unsubcribing from an event that is handled by a plugin
    if (typeof PhoneGap.windowEventHandler[e] !== "undefined") {
        if (PhoneGap.windowEventHandler[e](e, handler, false)) {
            return; // Stop default behavior
        }
    }

    PhoneGap.m_window_removeEventListener.call(window, evt, handler, capture);
};

/**
 * Method to fire document event
 *
 * @param {String} type             The event type to fire
 * @param {Object} data             Data to send with event
 */
PhoneGap.fireDocumentEvent = function(type, data) {
    var e = document.createEvent('Events');
    e.initEvent(type);
    if (data) {
        for (var i in data) {
            e[i] = data[i];
        }
    }
    document.dispatchEvent(e);
};

/**
 * Method to fire window event
 *
 * @param {String} type             The event type to fire
 * @param {Object} data             Data to send with event
 */
PhoneGap.fireWindowEvent = function(type, data) {
    var e = document.createEvent('Events');
    e.initEvent(type);
    if (data) {
        for (var i in data) {
            e[i] = data[i];
        }
    }
    window.dispatchEvent(e);
};

/**
 * Method to fire event from native code
 * Leaving this generic version to handle problems with iOS 3.x. Is currently used by orientation and battery events
 * Remove when iOS 3.x no longer supported and call fireWindowEvent or fireDocumentEvent directly
 */
PhoneGap.fireEvent = function(type, target, data) {
    var e = document.createEvent('Events');
    e.initEvent(type);
    if (data) {
        for (var i in data) {
            e[i] = data[i];
        }
    }
    target = target || document;
    if (target.dispatchEvent === undefined) { // ie window.dispatchEvent is undefined in iOS 3.x
        target = document;
    } 

    target.dispatchEvent(e);
};
/**
 * Create a UUID
 *
 * @return
 */
PhoneGap.createUUID = function() {
    return PhoneGap.UUIDcreatePart(4) + '-' +
        PhoneGap.UUIDcreatePart(2) + '-' +
        PhoneGap.UUIDcreatePart(2) + '-' +
        PhoneGap.UUIDcreatePart(2) + '-' +
        PhoneGap.UUIDcreatePart(6);
};

PhoneGap.UUIDcreatePart = function(length) {
    var uuidpart = "";
    for (var i=0; i<length; i++) {
        var uuidchar = parseInt((Math.random() * 256)).toString(16);
        if (uuidchar.length == 1) {
            uuidchar = "0" + uuidchar;
        }
        uuidpart += uuidchar;
    }
    return uuidpart;
};
};


if (!PhoneGap.hasResource("debugconsole")) {
	PhoneGap.addResource("debugconsole");
	
/**
 * This class provides access to the debugging console.
 * @constructor
 */
var DebugConsole = function() {
    this.winConsole = window.console;
    this.logLevel = DebugConsole.INFO_LEVEL;
}

// from most verbose, to least verbose
DebugConsole.ALL_LEVEL    = 1; // same as first level
DebugConsole.INFO_LEVEL   = 1;
DebugConsole.WARN_LEVEL   = 2;
DebugConsole.ERROR_LEVEL  = 4;
DebugConsole.NONE_LEVEL   = 8;
													
DebugConsole.prototype.setLevel = function(level) {
    this.logLevel = level;
};

/**
 * Utility function for rendering and indenting strings, or serializing
 * objects to a string capable of being printed to the console.
 * @param {Object|String} message The string or object to convert to an indented string
 * @private
 */
DebugConsole.prototype.processMessage = function(message, maxDepth) {
	if (maxDepth === undefined) maxDepth = 0;
    if (typeof(message) != 'object') {
        return (this.isDeprecated ? "WARNING: debug object is deprecated, please use console object \n" + message : message);
    } else {
        /**
         * @function
         * @ignore
         */
        function indent(str) {
            return str.replace(/^/mg, "    ");
        }
        /**
         * @function
         * @ignore
         */
        function makeStructured(obj, depth) {
            var str = "";
            for (var i in obj) {
                try {
                    if (typeof(obj[i]) == 'object' && depth < maxDepth) {
                        str += i + ":\n" + indent(makeStructured(obj[i])) + "\n";
                    } else {
                        str += i + " = " + indent(String(obj[i])).replace(/^    /, "") + "\n";
                    }
                } catch(e) {
                    str += i + " = EXCEPTION: " + e.message + "\n";
                }
            }
            return str;
        }
        
        return ("Object:\n" + makeStructured(message, maxDepth));
    }
};

/**
 * Print a normal log message to the console
 * @param {Object|String} message Message or object to print to the console
 */
DebugConsole.prototype.log = function(message, maxDepth) {
    if (PhoneGap.available && this.logLevel <= DebugConsole.INFO_LEVEL)
        PhoneGap.exec(null, null, 'com.phonegap.debugconsole', 'log',
            [ this.processMessage(message, maxDepth), { logLevel: 'INFO' } ]
        );
    else
        this.winConsole.log(message);
};

/**
 * Print a warning message to the console
 * @param {Object|String} message Message or object to print to the console
 */
DebugConsole.prototype.warn = function(message, maxDepth) {
    if (PhoneGap.available && this.logLevel <= DebugConsole.WARN_LEVEL)
    	PhoneGap.exec(null, null, 'com.phonegap.debugconsole', 'log',
            [ this.processMessage(message, maxDepth), { logLevel: 'WARN' } ]
        );
    else
        this.winConsole.error(message);
};

/**
 * Print an error message to the console
 * @param {Object|String} message Message or object to print to the console
 */
DebugConsole.prototype.error = function(message, maxDepth) {
    if (PhoneGap.available && this.logLevel <= DebugConsole.ERROR_LEVEL)
		PhoneGap.exec(null, null, 'com.phonegap.debugconsole', 'log',
            [ this.processMessage(message, maxDepth), { logLevel: 'ERROR' } ]
        );
    else
        this.winConsole.error(message);
};

PhoneGap.addConstructor(function() {
    window.console = new DebugConsole();
});
};
if (!PhoneGap.hasResource("position")) {
	PhoneGap.addResource("position");

/**
 * This class contains position information.
 * @param {Object} lat
 * @param {Object} lng
 * @param {Object} acc
 * @param {Object} alt
 * @param {Object} altAcc
 * @param {Object} head
 * @param {Object} vel
 * @constructor
 */
Position = function(coords, timestamp) {
	this.coords = Coordinates.cloneFrom(coords);
    this.timestamp = timestamp || new Date().getTime();
};

Position.prototype.equals = function(other) {
    return (this.coords && other && other.coords &&
            this.coords.latitude == other.coords.latitude &&
            this.coords.longitude == other.coords.longitude);
};

Position.prototype.clone = function()
{
    return new Position(
        this.coords? this.coords.clone() : null,
        this.timestamp? this.timestamp : new Date().getTime()
    );
}

Coordinates = function(lat, lng, alt, acc, head, vel, altAcc) {
	/**
	 * The latitude of the position.
	 */
	this.latitude = lat;
	/**
	 * The longitude of the position,
	 */
	this.longitude = lng;
	/**
	 * The altitude of the position.
	 */
	this.altitude = alt;
	/**
	 * The accuracy of the position.
	 */
	this.accuracy = acc;
	/**
	 * The direction the device is moving at the position.
	 */
	this.heading = head;
	/**
	 * The velocity with which the device is moving at the position.
	 */
	this.speed = vel;
	/**
	 * The altitude accuracy of the position.
	 */
	this.altitudeAccuracy = (altAcc != 'undefined') ? altAcc : null; 
};

Coordinates.prototype.clone = function()
{
    return new Coordinates(
        this.latitude,
        this.longitude,
        this.altitude,
        this.accuracy,
        this.heading,
        this.speed,
        this.altitudeAccuracy
    );
};

Coordinates.cloneFrom = function(obj)
{
    return new Coordinates(
        obj.latitude,
        obj.longitude,
        obj.altitude,
        obj.accuracy,
        obj.heading,
        obj.speed,
        obj.altitudeAccuracy
    );
};

/**
 * This class specifies the options for requesting position data.
 * @constructor
 */
PositionOptions = function(enableHighAccuracy, timeout, maximumAge) {
	/**
	 * Specifies the desired position accuracy.
	 */
	this.enableHighAccuracy = enableHighAccuracy || false;
	/**
	 * The timeout after which if position data cannot be obtained the errorCallback
	 * is called.
	 */
	this.timeout = timeout || 10000;
	/**
     * The age of a cached position whose age is no greater than the specified time 
     * in milliseconds. 
     */
	this.maximumAge = maximumAge || 0;
	
	if (this.maximumAge < 0) {
		this.maximumAge = 0;
	}
};

/**
 * This class contains information about any GPS errors.
 * @constructor
 */
PositionError = function(code, message) {
	this.code = code || 0;
	this.message = message || "";
};

PositionError.UNKNOWN_ERROR = 0;
PositionError.PERMISSION_DENIED = 1;
PositionError.POSITION_UNAVAILABLE = 2;
PositionError.TIMEOUT = 3;

};if (!PhoneGap.hasResource("acceleration")) {
	PhoneGap.addResource("acceleration");
 	

/**
 * This class contains acceleration information
 * @constructor
 * @param {Number} x The force applied by the device in the x-axis.
 * @param {Number} y The force applied by the device in the y-axis.
 * @param {Number} z The force applied by the device in the z-axis.
 */
Acceleration = function(x, y, z) {
	/**
	 * The force applied by the device in the x-axis.
	 */
	this.x = x;
	/**
	 * The force applied by the device in the y-axis.
	 */
	this.y = y;
	/**
	 * The force applied by the device in the z-axis.
	 */
	this.z = z;
	/**
	 * The time that the acceleration was obtained.
	 */
	this.timestamp = new Date().getTime();
}

/**
 * This class specifies the options for requesting acceleration data.
 * @constructor
 */
AccelerationOptions = function() {
	/**
	 * The timeout after which if acceleration data cannot be obtained the errorCallback
	 * is called.
	 */
	this.timeout = 10000;
}
};if (!PhoneGap.hasResource("accelerometer")) {
	PhoneGap.addResource("accelerometer");

/**
 * This class provides access to device accelerometer data.
 * @constructor
 */
Accelerometer = function() 
{
	/**
	 * The last known acceleration.
	 */
	this.lastAcceleration = new Acceleration(0,0,0);
}

/**
 * Asynchronously aquires the current acceleration.
 * @param {Function} successCallback The function to call when the acceleration
 * data is available
 * @param {Function} errorCallback The function to call when there is an error 
 * getting the acceleration data.
 * @param {AccelerationOptions} options The options for getting the accelerometer data
 * such as timeout.
 */
Accelerometer.prototype.getCurrentAcceleration = function(successCallback, errorCallback, options) {
	// If the acceleration is available then call success
	// If the acceleration is not available then call error
	
	// Created for iPhone, Iphone passes back _accel obj litteral
	if (typeof successCallback == "function") {
		successCallback(this.lastAcceleration);
	}
};

// private callback called from Obj-C by name
Accelerometer.prototype._onAccelUpdate = function(x,y,z)
{
   this.lastAcceleration = new Acceleration(x,y,z);
};

/**
 * Asynchronously aquires the acceleration repeatedly at a given interval.
 * @param {Function} successCallback The function to call each time the acceleration
 * data is available
 * @param {Function} errorCallback The function to call when there is an error 
 * getting the acceleration data.
 * @param {AccelerationOptions} options The options for getting the accelerometer data
 * such as timeout.
 */

Accelerometer.prototype.watchAcceleration = function(successCallback, errorCallback, options) {
	//this.getCurrentAcceleration(successCallback, errorCallback, options);
	// TODO: add the interval id to a list so we can clear all watches
 	var frequency = (options != undefined && options.frequency != undefined) ? options.frequency : 10000;
	var updatedOptions = {
		desiredFrequency:frequency 
	}
	PhoneGap.exec(null, null, "com.phonegap.accelerometer", "start", [options]);

	return setInterval(function() {
		navigator.accelerometer.getCurrentAcceleration(successCallback, errorCallback, options);
	}, frequency);
};

/**
 * Clears the specified accelerometer watch.
 * @param {String} watchId The ID of the watch returned from #watchAcceleration.
 */
Accelerometer.prototype.clearWatch = function(watchId) {
	PhoneGap.exec(null, null, "com.phonegap.accelerometer", "stop", []);
	clearInterval(watchId);
};

Accelerometer.install = function()
{
    if (typeof navigator.accelerometer == "undefined") {
		navigator.accelerometer = new Accelerometer();
	}
};

Accelerometer.installDeviceMotionHandler = function()
{
	if (!(window.DeviceMotionEvent == undefined)) {
		// supported natively, so we don't have to add support
		return;
	}	
	
	var self = this;
	var devicemotionEvent = 'devicemotion';
	self.deviceMotionWatchId = null;
	self.deviceMotionListenerCount = 0;
	self.deviceMotionLastEventTimestamp = 0;
	
	// backup original `window.addEventListener`, `window.removeEventListener`
    var _addEventListener = window.addEventListener;
    var _removeEventListener = window.removeEventListener;
													
	var windowDispatchAvailable = !(window.dispatchEvent === undefined); // undefined in iOS 3.x
													
	var accelWin = function(acceleration) {
		var evt = document.createEvent('Events');
	    evt.initEvent(devicemotionEvent);
	
		evt.acceleration = null; // not all devices have gyroscope, don't care for now if we actually have it.
		evt.rotationRate = null; // not all devices have gyroscope, don't care for now if we actually have it:
		evt.accelerationIncludingGravity = acceleration; // accelerometer, all iOS devices have it
		
		var currentTime = new Date().getTime();
		evt.interval =  (self.deviceMotionLastEventTimestamp == 0) ? 0 : (currentTime - self.deviceMotionLastEventTimestamp);
		self.deviceMotionLastEventTimestamp = currentTime;
		
		if (windowDispatchAvailable) {
			window.dispatchEvent(evt);
		} else {
			document.dispatchEvent(evt);
		}
	};
	
	var accelFail = function() {
		
	};
													
    // override `window.addEventListener`
    window.addEventListener = function() {
        if (arguments[0] === devicemotionEvent) {
            ++(self.deviceMotionListenerCount);
			if (self.deviceMotionListenerCount == 1) { // start
				self.deviceMotionWatchId = navigator.accelerometer.watchAcceleration(accelWin, accelFail, { frequency:500});
			}
		} 
													
		if (!windowDispatchAvailable) {
			return document.addEventListener.apply(this, arguments);
		} else {
			return _addEventListener.apply(this, arguments);
		}
    };	

    // override `window.removeEventListener'
    window.removeEventListener = function() {
        if (arguments[0] === devicemotionEvent) {
            --(self.deviceMotionListenerCount);
			if (self.deviceMotionListenerCount == 0) { // stop
				navigator.accelerometer.clearWatch(self.deviceMotionWatchId);
			}
		} 
		
		if (!windowDispatchAvailable) {
			return document.removeEventListener.apply(this, arguments);
		} else {
			return _removeEventListener.apply(this, arguments);
		}
    };	
};


PhoneGap.addConstructor(Accelerometer.install);
PhoneGap.addConstructor(Accelerometer.installDeviceMotionHandler);

};
if (!PhoneGap.hasResource("battery")) {
PhoneGap.addResource("battery");

/**
 * This class contains information about the current battery status.
 * @constructor
 */
var Battery = function() {
    this._level = null;
    this._isPlugged = null;
    this._batteryListener = [];
    this._lowListener = [];
    this._criticalListener = [];
};

/**
 * Registers as an event producer for battery events.
 * 
 * @param {Object} eventType
 * @param {Object} handler
 * @param {Object} add
 */
Battery.prototype.eventHandler = function(eventType, handler, add) {
    var me = navigator.battery;
    if (add) {
        // If there are no current registered event listeners start the battery listener on native side.
        if (me._batteryListener.length === 0 && me._lowListener.length === 0 && me._criticalListener.length === 0) {
            PhoneGap.exec(me._status, me._error, "com.phonegap.battery", "start", []);
        }
        
        // Register the event listener in the proper array
        if (eventType === "batterystatus") {
            var pos = me._batteryListener.indexOf(handler);
            if (pos === -1) {
            	me._batteryListener.push(handler);
            }
        } else if (eventType === "batterylow") {
            var pos = me._lowListener.indexOf(handler);
            if (pos === -1) {
            	me._lowListener.push(handler);
            }
        } else if (eventType === "batterycritical") {
            var pos = me._criticalListener.indexOf(handler);
            if (pos === -1) {
            	me._criticalListener.push(handler);
            }
        }
    } else {
        // Remove the event listener from the proper array
        if (eventType === "batterystatus") {
            var pos = me._batteryListener.indexOf(handler);
            if (pos > -1) {
                me._batteryListener.splice(pos, 1);        
            }
        } else if (eventType === "batterylow") {
            var pos = me._lowListener.indexOf(handler);
            if (pos > -1) {
                me._lowListener.splice(pos, 1);        
            }
        } else if (eventType === "batterycritical") {
            var pos = me._criticalListener.indexOf(handler);
            if (pos > -1) {
                me._criticalListener.splice(pos, 1);        
            }
        }
        
        // If there are no more registered event listeners stop the battery listener on native side.
        if (me._batteryListener.length === 0 && me._lowListener.length === 0 && me._criticalListener.length === 0) {
            PhoneGap.exec(null, null, "com.phonegap.battery", "stop", []);
        }
    }
};

/**
 * Callback for battery status
 * 
 * @param {Object} info			keys: level, isPlugged
 */
Battery.prototype._status = function(info) {
	if (info) {
		var me = this;
		if (me._level != info.level || me._isPlugged != info.isPlugged) {
			// Fire batterystatus event
			//PhoneGap.fireWindowEvent("batterystatus", info);
			// use this workaround since iOS 3.x does have window.dispatchEvent
			PhoneGap.fireEvent("batterystatus", window, info);	

			// Fire low battery event
			if (info.level == 20 || info.level == 5) {
				if (info.level == 20) {
					//PhoneGap.fireWindowEvent("batterylow", info);
					// use this workaround since iOS 3.x does not have window.dispatchEvent
					PhoneGap.fireEvent("batterylow", window, info);
				}
				else {
					//PhoneGap.fireWindowEvent("batterycritical", info);
					// use this workaround since iOS 3.x does not have window.dispatchEvent
					PhoneGap.fireEvent("batterycritical", window, info);
				}
			}
		}
		me._level = info.level;
		me._isPlugged = info.isPlugged;	
	}
};

/**
 * Error callback for battery start
 */
Battery.prototype._error = function(e) {
    console.log("Error initializing Battery: " + e);
};

PhoneGap.addConstructor(function() {
    if (typeof navigator.battery === "undefined") {
        navigator.battery = new Battery();
        PhoneGap.addWindowEventHandler("batterystatus", navigator.battery.eventHandler);
        PhoneGap.addWindowEventHandler("batterylow", navigator.battery.eventHandler);
        PhoneGap.addWindowEventHandler("batterycritical", navigator.battery.eventHandler);
    }
});
}if (!PhoneGap.hasResource("camera")) {
	PhoneGap.addResource("camera");
	

/**
 * This class provides access to the device camera.
 * @constructor
 */
Camera = function() {
	
}
/**
 *  Available Camera Options
 *  {boolean} allowEdit - true to allow editing image, default = false
 *	{number} quality 0-100 (low to high) default =  100
 *  {Camera.DestinationType} destinationType default = DATA_URL
 *	{Camera.PictureSourceType} sourceType default = CAMERA
 *	{number} targetWidth - width in pixels to scale image default = 0 (no scaling)
 *  {number} targetHeight - height in pixels to scale image default = 0 (no scaling)
 *  {Camera.EncodingType} - encodingType default = JPEG
 *  {boolean} correctOrientation - Rotate the image to correct for the orientation of the device during capture (iOS only)
 *  {boolean} saveToPhotoAlbum - Save the image to the photo album on the device after capture (iOS only)
 */
/**
 * Format of image that is returned from getPicture.
 *
 * Example: navigator.camera.getPicture(success, fail,
 *              { quality: 80,
 *                destinationType: Camera.DestinationType.DATA_URL,
 *                sourceType: Camera.PictureSourceType.PHOTOLIBRARY})
 */
Camera.DestinationType = {
    DATA_URL: 0,                // Return base64 encoded string
    FILE_URI: 1                 // Return file uri 
};
Camera.prototype.DestinationType = Camera.DestinationType;

/**
 * Source to getPicture from.
 *
 * Example: navigator.camera.getPicture(success, fail,
 *              { quality: 80,
 *                destinationType: Camera.DestinationType.DATA_URL,
 *                sourceType: Camera.PictureSourceType.PHOTOLIBRARY})
 */
Camera.PictureSourceType = {
    PHOTOLIBRARY : 0,           // Choose image from picture library 
    CAMERA : 1,                 // Take picture from camera
    SAVEDPHOTOALBUM : 2         // Choose image from picture library 
};
Camera.prototype.PictureSourceType = Camera.PictureSourceType;

/** 
 * Encoding of image returned from getPicture. 
 * 
 * Example: navigator.camera.getPicture(success, fail, 
 *              { quality: 80, 
 *                destinationType: Camera.DestinationType.DATA_URL, 
 *                sourceType: Camera.PictureSourceType.CAMERA, 
 *                encodingType: Camera.EncodingType.PNG}) 
 */ 
Camera.EncodingType = { 
	JPEG: 0,                    // Return JPEG encoded image 
	PNG: 1                      // Return PNG encoded image 
};
Camera.prototype.EncodingType = Camera.EncodingType;

/** 
 * Type of pictures to select from.  Only applicable when
 *	PictureSourceType is PHOTOLIBRARY or SAVEDPHOTOALBUM 
 * 
 * Example: navigator.camera.getPicture(success, fail, 
 *              { quality: 80, 
 *                destinationType: Camera.DestinationType.DATA_URL, 
 *                sourceType: Camera.PictureSourceType.PHOTOLIBRARY, 
 *                mediaType: Camera.MediaType.PICTURE}) 
 */ 
Camera.MediaType = { 
	PICTURE: 0,             // allow selection of still pictures only. DEFAULT. Will return format specified via DestinationType
	VIDEO: 1,                // allow selection of video only, ONLY RETURNS URL
	ALLMEDIA : 2			// allow selection from all media types
};
Camera.prototype.MediaType = Camera.MediaType;

/**
 * Gets a picture from source defined by "options.sourceType", and returns the
 * image as defined by the "options.destinationType" option.

 * The defaults are sourceType=CAMERA and destinationType=DATA_URL.
 *
 * @param {Function} successCallback
 * @param {Function} errorCallback
 * @param {Object} options
 */
Camera.prototype.getPicture = function(successCallback, errorCallback, options) {
	// successCallback required
	if (typeof successCallback != "function") {
        console.log("Camera Error: successCallback is not a function");
        return;
    }

    // errorCallback optional
    if (errorCallback && (typeof errorCallback != "function")) {
        console.log("Camera Error: errorCallback is not a function");
        return;
    }
	
	PhoneGap.exec(successCallback, errorCallback, "com.phonegap.camera","getPicture",[options]);
};



PhoneGap.addConstructor(function() {
    if (typeof navigator.camera == "undefined") navigator.camera = new Camera();
});
};

if (!PhoneGap.hasResource("device")) {
	PhoneGap.addResource("device");

/**
 * this represents the mobile device, and provides properties for inspecting the model, version, UUID of the
 * phone, etc.
 * @constructor
 */
Device = function() 
{
    this.platform = null;
    this.version  = null;
    this.name     = null;
    this.phonegap      = null;
    this.uuid     = null;
    try 
	{      
		this.platform = DeviceInfo.platform;
		this.version  = DeviceInfo.version;
		this.name     = DeviceInfo.name;
		this.phonegap = DeviceInfo.gap;
		this.uuid     = DeviceInfo.uuid;

    } 
	catch(e) 
	{
        // TODO: 
    }
	this.available = PhoneGap.available = this.uuid != null;
}

PhoneGap.addConstructor(function() {
	if (typeof navigator.device === "undefined") {
    	navigator.device = window.device = new Device();
	}
});
};
if (!PhoneGap.hasResource("capture")) {
	PhoneGap.addResource("capture");
/**
 * The CaptureError interface encapsulates all errors in the Capture API.
 */
function CaptureError() {
   this.code = null;
};

// Capture error codes
CaptureError.CAPTURE_INTERNAL_ERR = 0;
CaptureError.CAPTURE_APPLICATION_BUSY = 1;
CaptureError.CAPTURE_INVALID_ARGUMENT = 2;
CaptureError.CAPTURE_NO_MEDIA_FILES = 3;
CaptureError.CAPTURE_NOT_SUPPORTED = 20;

/**
 * The Capture interface exposes an interface to the camera and microphone of the hosting device.
 */
function Capture() {
	this.supportedAudioModes = [];
	this.supportedImageModes = [];
	this.supportedVideoModes = [];
};

/**
 * Launch audio recorder application for recording audio clip(s).
 * 
 * @param {Function} successCB
 * @param {Function} errorCB
 * @param {CaptureAudioOptions} options
 *
 * No audio recorder to launch for iOS - return CAPTURE_NOT_SUPPORTED
 */
Capture.prototype.captureAudio = function(successCallback, errorCallback, options) {
	/*if (errorCallback && typeof errorCallback === "function") {
		errorCallback({
				"code": CaptureError.CAPTURE_NOT_SUPPORTED
			});
	}*/
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.mediacapture", "captureAudio", [options]);
};

/**
 * Launch camera application for taking image(s).
 * 
 * @param {Function} successCB
 * @param {Function} errorCB
 * @param {CaptureImageOptions} options
 */
Capture.prototype.captureImage = function(successCallback, errorCallback, options) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.mediacapture", "captureImage", [options]);
};

/**
 * Casts a PluginResult message property  (array of objects) to an array of MediaFile objects
 * (used in Objective-C)
 *
 * @param {PluginResult} pluginResult
 */
Capture.prototype._castMediaFile = function(pluginResult) {
    var mediaFiles = [];
    var i;
    for (i=0; i<pluginResult.message.length; i++) {
        var mediaFile = new MediaFile();
	    mediaFile.name = pluginResult.message[i].name;
	    mediaFile.fullPath = pluginResult.message[i].fullPath;
	    mediaFile.type = pluginResult.message[i].type;
	    mediaFile.lastModifiedDate = pluginResult.message[i].lastModifiedDate;
	    mediaFile.size = pluginResult.message[i].size;
        mediaFiles.push(mediaFile);
    }
    pluginResult.message = mediaFiles;
    return pluginResult;
};

/**
 * Launch device camera application for recording video(s).
 * 
 * @param {Function} successCB
 * @param {Function} errorCB
 * @param {CaptureVideoOptions} options
 */
Capture.prototype.captureVideo = function(successCallback, errorCallback, options) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.mediacapture", "captureVideo", [options]);
};

/**
 * Encapsulates a set of parameters that the capture device supports.
 */
function ConfigurationData() {
    // The ASCII-encoded string in lower case representing the media type. 
    this.type = null; 
    // The height attribute represents height of the image or video in pixels. 
    // In the case of a sound clip this attribute has value 0. 
    this.height = 0;
    // The width attribute represents width of the image or video in pixels. 
    // In the case of a sound clip this attribute has value 0
    this.width = 0;
};

/**
 * Encapsulates all image capture operation configuration options.
 */
var CaptureImageOptions = function() {
    // Upper limit of images user can take. Value must be equal or greater than 1.
    this.limit = 1; 
    // The selected image mode. Must match with one of the elements in supportedImageModes array.
    this.mode = null; 
};

/**
 * Encapsulates all video capture operation configuration options.
 */
var CaptureVideoOptions = function() {
    // Upper limit of videos user can record. Value must be equal or greater than 1.
    this.limit = 1;
    // Maximum duration of a single video clip in seconds.
    this.duration = 0;
    // The selected video mode. Must match with one of the elements in supportedVideoModes array.
    this.mode = null;
};

/**
 * Encapsulates all audio capture operation configuration options.
 */
var CaptureAudioOptions = function() {
    // Upper limit of sound clips user can record. Value must be equal or greater than 1.
    this.limit = 1;
    // Maximum duration of a single sound clip in seconds.
    this.duration = 0;
    // The selected audio mode. Must match with one of the elements in supportedAudioModes array.
    this.mode = null;
};

/**
 * Represents a single file.
 * 
 * name {DOMString} name of the file, without path information
 * fullPath {DOMString} the full path of the file, including the name
 * type {DOMString} mime type
 * lastModifiedDate {Date} last modified date
 * size {Number} size of the file in bytes
 */
function MediaFile(name, fullPath, type, lastModifiedDate, size) {
    this.name = name || null;
    this.fullPath = fullPath || null;
    this.type = type || null;
    this.lastModifiedDate = lastModifiedDate || null;
    this.size = size || 0;
}

/**
 * Request capture format data for a specific file and type
 * 
 * @param {Function} successCB
 * @param {Function} errorCB
 */
MediaFile.prototype.getFormatData = function(successCallback, errorCallback) {
	if (typeof this.fullPath === "undefined" || this.fullPath === null) {
		errorCallback({
				"code": CaptureError.CAPTURE_INVALID_ARGUMENT
			});
	} else {
    	PhoneGap.exec(successCallback, errorCallback, "com.phonegap.mediacapture", "getFormatData", [this.fullPath, this.type]);
	}	
};

/**
 * MediaFileData encapsulates format information of a media file.
 * 
 * @param {DOMString} codecs
 * @param {long} bitrate
 * @param {long} height
 * @param {long} width
 * @param {float} duration
 */
function MediaFileData(codecs, bitrate, height, width, duration) {
    this.codecs = codecs || null;
    this.bitrate = bitrate || 0;
    this.height = height || 0;
    this.width = width || 0;
    this.duration = duration || 0;
}

PhoneGap.addConstructor(function() {
    if (typeof navigator.device === "undefined") {
        navigator.device = window.device = new Device();
    }
    if (typeof navigator.device.capture === "undefined") {
        navigator.device.capture = window.device.capture = new Capture();
    }
});
};
if (!PhoneGap.hasResource("contact")) {
	PhoneGap.addResource("contact");


/**
* Contains information about a single contact.
* @param {DOMString} id unique identifier
* @param {DOMString} displayName
* @param {ContactName} name
* @param {DOMString} nickname
* @param {ContactField[]} phoneNumbers array of phone numbers
* @param {ContactField[]} emails array of email addresses
* @param {ContactAddress[]} addresses array of addresses
* @param {ContactField[]} ims instant messaging user ids
* @param {ContactOrganization[]} organizations
* @param {DOMString} birthday contact's birthday
* @param {DOMString} note user notes about contact
* @param {ContactField[]} photos
* @param {Array.<ContactField>} categories
* @param {ContactField[]} urls contact's web sites
*/
var Contact = function(id, displayName, name, nickname, phoneNumbers, emails, addresses,
    ims, organizations, birthday, note, photos, categories, urls) {
    this.id = id || null;
    this.displayName = displayName || null;
    this.name = name || null; // ContactName
    this.nickname = nickname || null;
    this.phoneNumbers = phoneNumbers || null; // ContactField[]
    this.emails = emails || null; // ContactField[]
    this.addresses = addresses || null; // ContactAddress[]
    this.ims = ims || null; // ContactField[]
    this.organizations = organizations || null; // ContactOrganization[]
    this.birthday = birthday || null; // JS Date
    this.note = note || null;
    this.photos = photos || null; // ContactField[]
    this.categories = categories || null; 
    this.urls = urls || null; // ContactField[]
};

/**
* Converts Dates to milliseconds before sending to iOS
*/
Contact.prototype.convertDatesOut = function()
{
	var dates = new Array("birthday");
	for (var i=0; i<dates.length; i++){
		var value = this[dates[i]];
		if (value){
			if (!value instanceof Date){
				try {
					value = new Date(value);
				} catch(exception){
					value = null;
				}
			}
			if (value instanceof Date){
				value = value.valueOf();
			}
			this[dates[i]] = value;
		}
	}
	
};
/**
* Converts milliseconds to JS Date when returning from iOS
*/
Contact.prototype.convertDatesIn = function()
{
	var dates = new Array("birthday");
	for (var i=0; i<dates.length; i++){
		var value = this[dates[i]];
		if (value){
			try {
				this[dates[i]] = new Date(parseFloat(value));
			} catch (exception){
				console.log("exception creating date");
			}
		}
	}
};
/**
* Removes contact from device storage.
* @param successCB success callback
* @param errorCB error callback (optional)
*/
Contact.prototype.remove = function(successCB, errorCB) {
	if (this.id == null) {
        var errorObj = new ContactError();
        errorObj.code = ContactError.UNKNOWN_ERROR;
        errorCB(errorObj);
    }
    else {
        PhoneGap.exec(successCB, errorCB, "com.phonegap.contacts", "remove", [{ "contact": this}]);
    }
};
/**
* iOS ONLY
* displays contact via iOS UI
*	NOT part of W3C spec so no official documentation
*
* @param errorCB error callback
* @param options object
*	allowsEditing: boolean AS STRING
*		"true" to allow editing the contact
*		"false" (default) display contact
*/
Contact.prototype.display = function(errorCB, options) { 
	if (this.id == null) {
        if (typeof errorCB == "function") {
        	var errorObj = new ContactError();
        	errorObj.code = ContactError.UNKNOWN_ERROR;
        	errorCB(errorObj);
		}
    }
    else {
        PhoneGap.exec(null, errorCB, "com.phonegap.contacts","displayContact", [this.id, options]);
    }
};

/**
* Creates a deep copy of this Contact.
* With the contact ID set to null.
* @return copy of this Contact
*/
Contact.prototype.clone = function() {
    var clonedContact = PhoneGap.clone(this);
    clonedContact.id = null;
    // Loop through and clear out any id's in phones, emails, etc.
    if (clonedContact.phoneNumbers) {
    	for (i=0; i<clonedContact.phoneNumbers.length; i++) {
    		clonedContact.phoneNumbers[i].id = null;
    	}
    }
    if (clonedContact.emails) {
    	for (i=0; i<clonedContact.emails.length; i++) {
    		clonedContact.emails[i].id = null;
    	}
    }
    if (clonedContact.addresses) {
    	for (i=0; i<clonedContact.addresses.length; i++) {
    		clonedContact.addresses[i].id = null;
    	}
    }
    if (clonedContact.ims) {
    	for (i=0; i<clonedContact.ims.length; i++) {
    		clonedContact.ims[i].id = null;
    	}
    }
    if (clonedContact.organizations) {
    	for (i=0; i<clonedContact.organizations.length; i++) {
    		clonedContact.organizations[i].id = null;
    	}
    }
    if (clonedContact.photos) {
    	for (i=0; i<clonedContact.photos.length; i++) {
    		clonedContact.photos[i].id = null;
    	}
    }
    if (clonedContact.urls) {
    	for (i=0; i<clonedContact.urls.length; i++) {
    		clonedContact.urls[i].id = null;
    	}
    }
    return clonedContact;
};

/**
* Persists contact to device storage.
* @param successCB success callback
* @param errorCB error callback - optional
*/
Contact.prototype.save = function(successCB, errorCB) {
	// don't modify the original contact
	var cloned = PhoneGap.clone(this);
	cloned.convertDatesOut(); 
	PhoneGap.exec(successCB, errorCB, "com.phonegap.contacts","save", [{"contact": cloned}]);
};

/**
* Contact name.
* @param formatted
* @param familyName
* @param givenName
* @param middle
* @param prefix
* @param suffix
*/
var ContactName = function(formatted, familyName, givenName, middle, prefix, suffix) {
    this.formatted = formatted != "undefined" ? formatted : null;
    this.familyName = familyName != "undefined" ? familyName : null;
    this.givenName = givenName != "undefined" ? givenName : null;
    this.middleName = middle != "undefined" ? middle : null;
    this.honorificPrefix = prefix != "undefined" ? prefix : null;
    this.honorificSuffix = suffix != "undefined" ? suffix : null;
};

/**
* Generic contact field.
* @param type
* @param value
* @param pref
* @param id
*/
var ContactField = function(type, value, pref, id) {
    this.type = type != "undefined" ? type : null;
    this.value = value != "undefined" ? value : null;
    this.pref = pref != "undefined" ? pref : null;
    this.id = id != "undefined" ? id : null;
};

/**
* Contact address.
* @param pref - boolean is primary / preferred address
* @param type - string - work, home…..
* @param formatted
* @param streetAddress
* @param locality
* @param region
* @param postalCode
* @param country
*/
var ContactAddress = function(pref, type, formatted, streetAddress, locality, region, postalCode, country, id) {
	this.pref = pref != "undefined" ? pref : null;
	this.type = type != "undefined" ? type : null;
    this.formatted = formatted != "undefined" ? formatted : null;
    this.streetAddress = streetAddress != "undefined" ? streetAddress : null;
    this.locality = locality != "undefined" ? locality : null;
    this.region = region != "undefined" ? region : null;
    this.postalCode = postalCode != "undefined" ? postalCode : null;
    this.country = country != "undefined" ? country : null;
    this.id = id != "undefined" ? id : null;
};

/**
* Contact organization.
* @param pref - boolean is primary / preferred address
* @param type - string - work, home…..
* @param name
* @param dept
* @param title
*/
var ContactOrganization = function(pref, type, name, dept, title) {
	this.pref = pref != "undefined" ? pref : null;
	this.type = type != "undefined" ? type : null;
    this.name = name != "undefined" ? name : null;
    this.department = dept != "undefined" ? dept : null;
    this.title = title != "undefined" ? title : null;
};

/**
* Contact account.
* @param domain
* @param username
* @param userid
*/
/*var ContactAccount = function(domain, username, userid) {
    this.domain = domain != "undefined" ? domain : null;
    this.username = username != "undefined" ? username : null;
    this.userid = userid != "undefined" ? userid : null;
}*/

/**
* Represents a group of Contacts.
*/
var Contacts = function() {
    this.inProgress = false;
    this.records = new Array();
};
/**
* Returns an array of Contacts matching the search criteria.
* @param fields that should be searched
* @param successCB success callback
* @param errorCB error callback (optional)
* @param {ContactFindOptions} options that can be applied to contact searching
* @return array of Contacts matching search criteria
*/
Contacts.prototype.find = function(fields, successCB, errorCB, options) {
	if (successCB === null) {
        throw new TypeError("You must specify a success callback for the find command.");
    }
    if (fields === null || fields === "undefined" || fields.length === "undefined" || fields.length <= 0) {
    	if (typeof errorCB === "function") {
			errorCB({"code": ContactError.INVALID_ARGUMENT_ERROR});
    	}
    } else {
		PhoneGap.exec(successCB, errorCB, "com.phonegap.contacts","search", [{"fields":fields, "findOptions":options}]);
    }
};
/**
* need to turn the array of JSON strings representing contact objects into actual objects
* @param array of JSON strings with contact data
* @return call results callback with array of Contact objects
*  This function is called from objective C Contacts.search() method.
*/
Contacts.prototype._findCallback = function(pluginResult) {
	var contacts = new Array();
	try {
		for (var i=0; i<pluginResult.message.length; i++) {
			var newContact = navigator.contacts.create(pluginResult.message[i]); 
			newContact.convertDatesIn();
			contacts.push(newContact);
		}
		pluginResult.message = contacts;
	} catch(e){
			console.log("Error parsing contacts: " +e);
	}
	return pluginResult;
}

/**
* need to turn the JSON string representing contact object into actual object
* @param JSON string with contact data
* Call stored results function with  Contact object
*  This function is called from objective C Contacts remove and save methods
*/
Contacts.prototype._contactCallback = function(pluginResult)
{
	var newContact = null;
	if (pluginResult.message){
		try {
			newContact = navigator.contacts.create(pluginResult.message);
			newContact.convertDatesIn();
		} catch(e){
			console.log("Error parsing contact");
		}
	}
	pluginResult.message = newContact;
	return pluginResult;
	
};
/** 
* Need to return an error object rather than just a single error code
* @param error code
* Call optional error callback if found.
* Called from objective c find, remove, and save methods on error.
*/
Contacts.prototype._errCallback = function(pluginResult)
{
	var errorObj = new ContactError();
   	errorObj.code = pluginResult.message;
	pluginResult.message = errorObj;
	return pluginResult;
};
// iPhone only api to create a new contact via the GUI
Contacts.prototype.newContactUI = function(successCallback) { 
    PhoneGap.exec(successCallback, null, "com.phonegap.contacts","newContact", []);
};
// iPhone only api to select a contact via the GUI
Contacts.prototype.chooseContact = function(successCallback, options) {
    PhoneGap.exec(successCallback, null, "com.phonegap.contacts","chooseContact", options);
};


/**
* This function creates a new contact, but it does not persist the contact
* to device storage. To persist the contact to device storage, invoke
* contact.save().
* @param properties an object who's properties will be examined to create a new Contact
* @returns new Contact object
*/
Contacts.prototype.create = function(properties) {
    var i;
    var contact = new Contact();
    for (i in properties) {
        if (contact[i] !== 'undefined') {
            contact[i] = properties[i];
        }
    }
    return contact;
};

/**
 * ContactFindOptions.
 * @param filter used to match contacts against
 * @param multiple boolean used to determine if more than one contact should be returned
 */
var ContactFindOptions = function(filter, multiple, updatedSince) {
    this.filter = filter || '';
    this.multiple = multiple || false;
};

/**
 *  ContactError.
 *  An error code assigned by an implementation when an error has occurred
 */
var ContactError = function() {
    this.code=null;
};

/**
 * Error codes
 */
ContactError.UNKNOWN_ERROR = 0;
ContactError.INVALID_ARGUMENT_ERROR = 1;
ContactError.TIMEOUT_ERROR = 2;
ContactError.PENDING_OPERATION_ERROR = 3;
ContactError.IO_ERROR = 4;
ContactError.NOT_SUPPORTED_ERROR = 5;
ContactError.PERMISSION_DENIED_ERROR = 20;

/**
 * Add the contact interface into the browser.
 */
PhoneGap.addConstructor(function() { 
    if(typeof navigator.contacts == "undefined") {
    	navigator.contacts = new Contacts();
    }
});
};
if (!PhoneGap.hasResource("file")) {
	PhoneGap.addResource("file");

/**
 * This class provides generic read and write access to the mobile device file system.
 * They are not used to read files from a server.
 */

/**
 * This class provides some useful information about a file.
 * This is the fields returned when navigator.fileMgr.getFileProperties() 
 * is called.
 */
FileProperties = function(filePath) {
    this.filePath = filePath;
    this.size = 0;
    this.lastModifiedDate = null;
}
/**
 * Represents a single file.
 * 
 * name {DOMString} name of the file, without path information
 * fullPath {DOMString} the full path of the file, including the name
 * type {DOMString} mime type
 * lastModifiedDate {Date} last modified date
 * size {Number} size of the file in bytes
 */
File = function(name, fullPath, type, lastModifiedDate, size) {
	this.name = name || null;
    this.fullPath = fullPath || null;
	this.type = type || null;
    this.lastModifiedDate = lastModifiedDate || null;
    this.size = size || 0;
}
/**
 * Create an event object since we can't set target on DOM event.
 *
 * @param type
 * @param target
 *
 */
File._createEvent = function(type, target) {
    // Can't create event object, since we can't set target (its readonly)
    //var evt = document.createEvent('Events');
    //evt.initEvent("onload", false, false);
    var evt = {"type": type};
    evt.target = target;
    return evt;
};

FileError = function() {
   this.code = null;
}

// File error codes
// Found in DOMException
FileError.NOT_FOUND_ERR = 1;
FileError.SECURITY_ERR = 2;
FileError.ABORT_ERR = 3;

// Added by this specification
FileError.NOT_READABLE_ERR = 4;
FileError.ENCODING_ERR = 5;
FileError.NO_MODIFICATION_ALLOWED_ERR = 6;
FileError.INVALID_STATE_ERR = 7;
FileError.SYNTAX_ERR = 8;
FileError.INVALID_MODIFICATION_ERR = 9;
FileError.QUOTA_EXCEEDED_ERR = 10;
FileError.TYPE_MISMATCH_ERR = 11;
FileError.PATH_EXISTS_ERR = 12;

//-----------------------------------------------------------------------------
// File manager
//-----------------------------------------------------------------------------

FileMgr = function() {
}

FileMgr.prototype.testFileExists = function(fileName, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "testFileExists", [fileName]);
};

FileMgr.prototype.testDirectoryExists = function(dirName, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "testDirectoryExists", [dirName]);
};

FileMgr.prototype.getFreeDiskSpace = function(successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "getFreeDiskSpace", []);
};

FileMgr.prototype.write = function(fileName, data, position, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "write", [fileName, data, position]);
};

FileMgr.prototype.truncate = function(fileName, size, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "truncateFile", [fileName, size]);
};

FileMgr.prototype.readAsText = function(fileName, encoding, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "readFile", [fileName, encoding]);
};

FileMgr.prototype.readAsDataURL = function(fileName, successCallback, errorCallback) {
	PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "readAsDataURL", [fileName]);
};

PhoneGap.addConstructor(function() {
    if (typeof navigator.fileMgr === "undefined") {
        navigator.fileMgr = new FileMgr();
    }
});


//-----------------------------------------------------------------------------
// File Reader
//-----------------------------------------------------------------------------

/**
 * This class reads the mobile device file system.
 *
 */
FileReader = function() {
    this.fileName = "";

    this.readyState = 0;

    // File data
    this.result = null;

    // Error
    this.error = null;

    // Event handlers
    this.onloadstart = null;    // When the read starts.
    this.onprogress = null;     // While reading (and decoding) file or fileBlob data, and reporting partial file data (progess.loaded/progress.total)
    this.onload = null;         // When the read has successfully completed.
    this.onerror = null;        // When the read has failed (see errors).
    this.onloadend = null;      // When the request has completed (either in success or failure).
    this.onabort = null;        // When the read has been aborted. For instance, by invoking the abort() method.
}

// States
FileReader.EMPTY = 0;
FileReader.LOADING = 1;
FileReader.DONE = 2;

/**
 * Abort reading file.
 */
FileReader.prototype.abort = function() {
    var evt;
    this.readyState = FileReader.DONE;
    this.result = null;

    // set error
    var error = new FileError();
    error.code = error.ABORT_ERR;
    this.error = error;
   
    // If error callback
    if (typeof this.onerror === "function") {
        evt = File._createEvent("error", this);
        this.onerror(evt);
    }
    // If abort callback
    if (typeof this.onabort === "function") {
        evt = File._createEvent("abort", this);
        this.onabort(evt);
    }
    // If load end callback
    if (typeof this.onloadend === "function") {
        evt = File._createEvent("loadend", this);
        this.onloadend(evt);
    }
};

/**
 * Read text file.
 *
 * @param file          The name of the file
 * @param encoding      [Optional] (see http://www.iana.org/assignments/character-sets)
 */
FileReader.prototype.readAsText = function(file, encoding) {
    this.fileName = "";
	if (typeof file.fullPath === "undefined") {
		this.fileName = file;
	} else {
		this.fileName = file.fullPath;
	}

    // LOADING state
    this.readyState = FileReader.LOADING;

    // If loadstart callback
    if (typeof this.onloadstart === "function") {
        var evt = File._createEvent("loadstart", this);
        this.onloadstart(evt);
    }

    // Default encoding is UTF-8
    var enc = encoding ? encoding : "UTF-8";

    var me = this;

    // Read file
    navigator.fileMgr.readAsText(this.fileName, enc,

        // Success callback
        function(r) {
            var evt;

            // If DONE (cancelled), then don't do anything
            if (me.readyState === FileReader.DONE) {
                return;
            }

            // Save result
            me.result = decodeURIComponent(r);

            // If onload callback
            if (typeof me.onload === "function") {
                evt = File._createEvent("load", me);
                me.onload(evt);
            }

            // DONE state
            me.readyState = FileReader.DONE;

            // If onloadend callback
            if (typeof me.onloadend === "function") {
                evt = File._createEvent("loadend", me);
                me.onloadend(evt);
            }
        },

        // Error callback
        function(e) {
            var evt;
            // If DONE (cancelled), then don't do anything
            if (me.readyState === FileReader.DONE) {
                return;
            }

            // Save error
            me.error = e;

            // If onerror callback
            if (typeof me.onerror === "function") {
                evt = File._createEvent("error", me);
                me.onerror(evt);
            }

            // DONE state
            me.readyState = FileReader.DONE;

            // If onloadend callback
            if (typeof me.onloadend === "function") {
                evt = File._createEvent("loadend", me);
                me.onloadend(evt);
            }
        }
        );
};


/**
 * Read file and return data as a base64 encoded data url.
 * A data url is of the form:
 *      data:[<mediatype>][;base64],<data>
 *
 * @param file          {File} File object containing file properties
 */
FileReader.prototype.readAsDataURL = function(file) {
    this.fileName = "";
    
    if (typeof file.fullPath === "undefined") {
        this.fileName = file;
    } else {
        this.fileName = file.fullPath;
    }

    // LOADING state
    this.readyState = FileReader.LOADING;

    // If loadstart callback
    if (typeof this.onloadstart === "function") {
        var evt = File._createEvent("loadstart", this);
        this.onloadstart(evt);
    }

    var me = this;

    // Read file
    navigator.fileMgr.readAsDataURL(this.fileName,

        // Success callback
        function(r) {
            var evt;

            // If DONE (cancelled), then don't do anything
            if (me.readyState === FileReader.DONE) {
                return;
            }

            // Save result
            me.result = r;

            // If onload callback
            if (typeof me.onload === "function") {
                evt = File._createEvent("load", me);
                me.onload(evt);
            }

            // DONE state
            me.readyState = FileReader.DONE;

            // If onloadend callback
            if (typeof me.onloadend === "function") {
                evt = File._createEvent("loadend", me);
                me.onloadend(evt);
            }
        },

        // Error callback
        function(e) {
            var evt;
            // If DONE (cancelled), then don't do anything
            if (me.readyState === FileReader.DONE) {
                return;
            }

            // Save error
            me.error = e;

            // If onerror callback
            if (typeof me.onerror === "function") {
                evt = File._createEvent("error", me);
                me.onerror(evt);
            }

            // DONE state
            me.readyState = FileReader.DONE;

            // If onloadend callback
            if (typeof me.onloadend === "function") {
                evt = File._createEvent("loadend", me);
                me.onloadend(evt);
            }
        }
        );
};

/**
 * Read file and return data as a binary data.
 *
 * @param file          The name of the file
 */
FileReader.prototype.readAsBinaryString = function(file) {
    // TODO - Can't return binary data to browser.
    this.fileName = file;
};

/**
 * Read file and return data as a binary data.
 *
 * @param file          The name of the file
 */
FileReader.prototype.readAsArrayBuffer = function(file) {
    // TODO - Can't return binary data to browser.
    this.fileName = file;
};

//-----------------------------------------------------------------------------
// File Writer
//-----------------------------------------------------------------------------

/**
 * This class writes to the mobile device file system.
 *
  @param file {File} a File object representing a file on the file system
*/
FileWriter = function(file) {
    this.fileName = "";
    this.length = 0;
	if (file) {
	    this.fileName = file.fullPath || file;
	    this.length = file.size || 0;
	}
	
	// default is to write at the beginning of the file
    this.position = 0;
    
    this.readyState = 0; // EMPTY

    this.result = null;

    // Error
    this.error = null;

    // Event handlers
    this.onwritestart = null;	// When writing starts
    this.onprogress = null;		// While writing the file, and reporting partial file data
    this.onwrite = null;		// When the write has successfully completed.
    this.onwriteend = null;		// When the request has completed (either in success or failure).
    this.onabort = null;		// When the write has been aborted. For instance, by invoking the abort() method.
    this.onerror = null;		// When the write has failed (see errors).
}

// States
FileWriter.INIT = 0;
FileWriter.WRITING = 1;
FileWriter.DONE = 2;

/**
 * Abort writing file.
 */
FileWriter.prototype.abort = function() {
    // check for invalid state
	if (this.readyState === FileWriter.DONE || this.readyState === FileWriter.INIT) {
		throw FileError.INVALID_STATE_ERR;
	} 

    // set error
    var error = new FileError(), evt;
    error.code = error.ABORT_ERR;
    this.error = error;
    
    // If error callback
    if (typeof this.onerror === "function") {
        evt = File._createEvent("error", this);
        this.onerror(evt);
    }
    // If abort callback
    if (typeof this.onabort === "function") {
        evt = File._createEvent("abort", this);
        this.onabort(evt);
    }
    
    this.readyState = FileWriter.DONE;

    // If write end callback
    if (typeof this.onwriteend == "function") {
        evt = File._createEvent("writeend", this);
        this.onwriteend(evt);
    }
};

/**
 * @Deprecated: use write instead
 * 
 * @param file to write the data to
 * @param text to be written
 * @param bAppend if true write to end of file, otherwise overwrite the file
 */
FileWriter.prototype.writeAsText = function(file, text, bAppend) {
	// Throw an exception if we are already writing a file
	if (this.readyState === FileWriter.WRITING) {
		throw FileError.INVALID_STATE_ERR;
	}

	if (bAppend !== true) {
        bAppend = false; // for null values
    }

    this.fileName = file;

    // WRITING state
    this.readyState = FileWriter.WRITING;

    var me = this;

    // If onwritestart callback
    if (typeof me.onwritestart === "function") {
        var evt = File._createEvent("writestart", me);
        me.onwritestart(evt);
    }
	
	
    // Write file 
	navigator.fileMgr.writeAsText(file, text, bAppend,
        // Success callback
        function(r) {
            var evt;

            // If DONE (cancelled), then don't do anything
            if (me.readyState === FileWriter.DONE) {
                return;
            }

            // Save result
            me.result = r;

            // If onwrite callback
            if (typeof me.onwrite === "function") {
                evt = File._createEvent("write", me);
                me.onwrite(evt);
            }

            // DONE state
            me.readyState = FileWriter.DONE;

            // If onwriteend callback
            if (typeof me.onwriteend === "function") {
                evt = File._createEvent("writeend", me);
                me.onwriteend(evt);
            }
        },

        // Error callback
        function(e) {
            var evt;

            // If DONE (cancelled), then don't do anything
            if (me.readyState === FileWriter.DONE) {
                return;
            }

            // Save error
            me.error = e;

            // If onerror callback
            if (typeof me.onerror === "function") {
                evt = File._createEvent("error", me);
                me.onerror(evt);
            }

            // DONE state
            me.readyState = FileWriter.DONE;

            // If onwriteend callback
            if (typeof me.onwriteend === "function") {
                evt = File._createEvent("writeend", me);
                me.onwriteend(evt);
            }
        }
    );
};

/**
 * Writes data to the file
 *  
 * @param text to be written
 */
FileWriter.prototype.write = function(text) {
	// Throw an exception if we are already writing a file
	if (this.readyState === FileWriter.WRITING) {
		throw FileError.INVALID_STATE_ERR;
	}

    // WRITING state
    this.readyState = FileWriter.WRITING;

    var me = this;

    // If onwritestart callback
    if (typeof me.onwritestart === "function") {
        var evt = File._createEvent("writestart", me);
        me.onwritestart(evt);
    }

    // Write file
    navigator.fileMgr.write(this.fileName, text, this.position,

        // Success callback
        function(r) {
            var evt;
            // If DONE (cancelled), then don't do anything
            if (me.readyState === FileWriter.DONE) {
                return;
            }

            
            // position always increases by bytes written because file would be extended
            me.position += r;
			// The length of the file is now where we are done writing.
			me.length = me.position;
            
            // If onwrite callback
            if (typeof me.onwrite === "function") {
                evt = File._createEvent("write", me);
                me.onwrite(evt);
            }

            // DONE state
            me.readyState = FileWriter.DONE;

            // If onwriteend callback
            if (typeof me.onwriteend === "function") {
                evt = File._createEvent("writeend", me);
                me.onwriteend(evt);
            }
        },

        // Error callback
        function(e) {
            var evt;

            // If DONE (cancelled), then don't do anything
            if (me.readyState === FileWriter.DONE) {
                return;
            }

            // Save error
            me.error = e;

            // If onerror callback
            if (typeof me.onerror === "function") {
                evt = File._createEvent("error", me);
                me.onerror(evt);
            }

            // DONE state
            me.readyState = FileWriter.DONE;

            // If onwriteend callback
            if (typeof me.onwriteend === "function") {
                evt = File._createEvent("writeend", me);
                me.onwriteend(evt);
            }
        }
        );

};

/** 
 * Moves the file pointer to the location specified.
 * 
 * If the offset is a negative number the position of the file 
 * pointer is rewound.  If the offset is greater than the file 
 * size the position is set to the end of the file.  
 * 
 * @param offset is the location to move the file pointer to.
 */
FileWriter.prototype.seek = function(offset) {
    // Throw an exception if we are already writing a file
    if (this.readyState === FileWriter.WRITING) {
        throw FileError.INVALID_STATE_ERR;
    }

    if (!offset) {
        return;
    }
    
    // See back from end of file.
    if (offset < 0) {
		this.position = Math.max(offset + this.length, 0);
	}
    // Offset is bigger then file size so set position 
    // to the end of the file.
	else if (offset > this.length) {
		this.position = this.length;
	}
    // Offset is between 0 and file size so set the position
    // to start writing.
	else {
		this.position = offset;
	}	
};

/** 
 * Truncates the file to the size specified.
 * 
 * @param size to chop the file at.
 */
FileWriter.prototype.truncate = function(size) {
	// Throw an exception if we are already writing a file
	if (this.readyState === FileWriter.WRITING) {
		throw FileError.INVALID_STATE_ERR;
	}
	// what if no size specified? 

    // WRITING state
    this.readyState = FileWriter.WRITING;

    var me = this;

    // If onwritestart callback
    if (typeof me.onwritestart === "function") {
        var evt = File._createEvent("writestart", me);
        me.onwritestart(evt);
    }

    // Write file
    navigator.fileMgr.truncate(this.fileName, size,

        // Success callback
        function(r) {
            var evt;
            // If DONE (cancelled), then don't do anything
            if (me.readyState === FileWriter.DONE) {
                return;
            }

            // Update the length of the file
            me.length = r;
            me.position = Math.min(me.position, r);

            // If onwrite callback
            if (typeof me.onwrite === "function") {
                evt = File._createEvent("write", me);
                me.onwrite(evt);
            }

            // DONE state
            me.readyState = FileWriter.DONE;

            // If onwriteend callback
            if (typeof me.onwriteend === "function") {
                evt = File._createEvent("writeend", me);
                me.onwriteend(evt);
            }
        },

        // Error callback
        function(e) {
            var evt;
            // If DONE (cancelled), then don't do anything
            if (me.readyState === FileWriter.DONE) {
                return;
            }

            // Save error
            me.error = e;

            // If onerror callback
            if (typeof me.onerror === "function") {
                evt = File._createEvent("error", me);
                me.onerror(evt);
            }

            // DONE state
            me.readyState = FileWriter.DONE;

            // If onwriteend callback
            if (typeof me.onwriteend === "function") {
                evt = File._createEvent("writeend", me);
                me.onwriteend(evt);
            }
        }
    );
};

LocalFileSystem = function() {
};

// File error codes
LocalFileSystem.TEMPORARY = 0;
LocalFileSystem.PERSISTENT = 1;
LocalFileSystem.RESOURCE = 2;
LocalFileSystem.APPLICATION = 3;

/**
 * Requests a filesystem in which to store application data.
 * 
 * @param {int} type of file system being requested
 * @param {Function} successCallback is called with the new FileSystem
 * @param {Function} errorCallback is called with a FileError
 */
LocalFileSystem.prototype.requestFileSystem = function(type, size, successCallback, errorCallback) {
	if (type < 0 || type > 3) {
		if (typeof errorCallback == "function") {
			errorCallback({
				"code": FileError.SYNTAX_ERR
			});
		}
	}
	else {
		PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "requestFileSystem", [type, size]);
	}
};

/**
 * 
 * @param {DOMString} uri referring to a local file in a filesystem
 * @param {Function} successCallback is called with the new entry
 * @param {Function} errorCallback is called with a FileError
 */
LocalFileSystem.prototype.resolveLocalFileSystemURI = function(uri, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "resolveLocalFileSystemURI", [uri]);
};

/**
* This function  is required as we need to convert raw 
* JSON objects into concrete File and Directory objects.  
* 
* @param a JSON Objects that need to be converted to DirectoryEntry or FileEntry objects.
* @returns an entry 
*/
LocalFileSystem.prototype._castFS = function(pluginResult) {
    var entry = null;
    entry = new DirectoryEntry();
    entry.isDirectory = pluginResult.message.root.isDirectory;
    entry.isFile = pluginResult.message.root.isFile;
    entry.name = pluginResult.message.root.name;
    entry.fullPath = pluginResult.message.root.fullPath;
    pluginResult.message.root = entry;
    return pluginResult;    
}

LocalFileSystem.prototype._castEntry = function(pluginResult) {
    var entry = null;
    if (pluginResult.message.isDirectory) {
        entry = new DirectoryEntry();
    }
    else if (pluginResult.message.isFile) {
		entry = new FileEntry();
    }
    entry.isDirectory = pluginResult.message.isDirectory;
    entry.isFile = pluginResult.message.isFile;
    entry.name = pluginResult.message.name;
    entry.fullPath = pluginResult.message.fullPath;
    pluginResult.message = entry;
    return pluginResult;    
}

LocalFileSystem.prototype._castEntries = function(pluginResult) {
    var entries = pluginResult.message;
	var retVal = []; 
	for (i=0; i<entries.length; i++) {
		retVal.push(window.localFileSystem._createEntry(entries[i]));
	}
    pluginResult.message = retVal;
    return pluginResult;    
}

LocalFileSystem.prototype._createEntry = function(castMe) {
	var entry = null;
    if (castMe.isDirectory) {
        entry = new DirectoryEntry();
    }
    else if (castMe.isFile) {
        entry = new FileEntry();
    }
    entry.isDirectory = castMe.isDirectory;
    entry.isFile = castMe.isFile;
    entry.name = castMe.name;
    entry.fullPath = castMe.fullPath;
    return entry;    

}

LocalFileSystem.prototype._castDate = function(pluginResult) {
	if (pluginResult.message.modificationTime) {
		var metadataObj = new Metadata();
		
	    metadataObj.modificationTime = new Date(pluginResult.message.modificationTime);
	    pluginResult.message = metadataObj;
	}
	else if (pluginResult.message.lastModifiedDate) {
		var file = new File();
        file.size = pluginResult.message.size;
        file.type = pluginResult.message.type;
        file.name = pluginResult.message.name;
        file.fullPath = pluginResult.message.fullPath;
		file.lastModifiedDate = new Date(pluginResult.message.lastModifiedDate);
	    pluginResult.message = file;		
	}

    return pluginResult;	
}
LocalFileSystem.prototype._castError = function(pluginResult) {
	var fileError = new FileError();
	fileError.code = pluginResult.message;
	pluginResult.message = fileError;
	return pluginResult;
}

/**
 * Information about the state of the file or directory
 * 
 * {Date} modificationTime (readonly)
 */
Metadata = function() {
    this.modificationTime=null;
};

/**
 * Supplies arguments to methods that lookup or create files and directories
 * 
 * @param {boolean} create file or directory if it doesn't exist 
 * @param {boolean} exclusive if true the command will fail if the file or directory exists
 */
Flags = function(create, exclusive) {
    this.create = create || false;
    this.exclusive = exclusive || false;
};

/**
 * An interface representing a file system
 * 
 * {DOMString} name the unique name of the file system (readonly)
 * {DirectoryEntry} root directory of the file system (readonly)
 */
FileSystem = function() {
    this.name = null;
    this.root = null;
};

/**
 * An interface representing a directory on the file system.
 * 
 * {boolean} isFile always false (readonly)
 * {boolean} isDirectory always true (readonly)
 * {DOMString} name of the directory, excluding the path leading to it (readonly)
 * {DOMString} fullPath the absolute full path to the directory (readonly)
 * {FileSystem} filesystem on which the directory resides (readonly)
 */
DirectoryEntry = function() {
    this.isFile = false;
    this.isDirectory = true;
    this.name = null;
    this.fullPath = null;
    this.filesystem = null;
};

/**
 * Copies a directory to a new location
 * 
 * @param {DirectoryEntry} parent the directory to which to copy the entry
 * @param {DOMString} newName the new name of the entry, defaults to the current name
 * @param {Function} successCallback is called with the new entry
 * @param {Function} errorCallback is called with a FileError
 */
DirectoryEntry.prototype.copyTo = function(parent, newName, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "copyTo", [this.fullPath, parent, newName]);
};

/**
 * Looks up the metadata of the entry
 * 
 * @param {Function} successCallback is called with a Metadata object
 * @param {Function} errorCallback is called with a FileError
 */
DirectoryEntry.prototype.getMetadata = function(successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "getMetadata", [this.fullPath]);
};

/**
 * Gets the parent of the entry
 * 
 * @param {Function} successCallback is called with a parent entry
 * @param {Function} errorCallback is called with a FileError
 */
DirectoryEntry.prototype.getParent = function(successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "getParent", [this.fullPath]);
};

/**
 * Moves a directory to a new location
 * 
 * @param {DirectoryEntry} parent the directory to which to move the entry
 * @param {DOMString} newName the new name of the entry, defaults to the current name
 * @param {Function} successCallback is called with the new entry
 * @param {Function} errorCallback is called with a FileError
 */
DirectoryEntry.prototype.moveTo = function(parent, newName, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "moveTo", [this.fullPath, parent, newName]);
};

/**
 * Removes the entry
 * 
 * @param {Function} successCallback is called with no parameters
 * @param {Function} errorCallback is called with a FileError
 */
DirectoryEntry.prototype.remove = function(successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "remove", [this.fullPath]);
};

/**
 * Returns a URI that can be used to identify this entry.
 * 
 * @param {DOMString} mimeType for a FileEntry, the mime type to be used to interpret the file, when loaded through this URI.
 * @param {Function} successCallback is called with the new entry
 * @param {Function} errorCallback is called with a FileError
 */
DirectoryEntry.prototype.toURI = function(mimeType, successCallback, errorCallback) {
    return "file://localhost" + this.fullPath;
    //PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "toURI", [this.fullPath, mimeType]);
};

/**
 * Creates a new DirectoryReader to read entries from this directory
 */
DirectoryEntry.prototype.createReader = function(successCallback, errorCallback) {
    return new DirectoryReader(this.fullPath);
};

/**
 * Creates or looks up a directory
 * 
 * @param {DOMString} path either a relative or absolute path from this directory in which to look up or create a directory
 * @param {Flags} options to create or excluively create the directory
 * @param {Function} successCallback is called with the new entry
 * @param {Function} errorCallback is called with a FileError
 */
DirectoryEntry.prototype.getDirectory = function(path, options, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "getDirectory", [this.fullPath, path, options]);
};

/**
 * Creates or looks up a file
 * 
 * @param {DOMString} path either a relative or absolute path from this directory in which to look up or create a file
 * @param {Flags} options to create or excluively create the file
 * @param {Function} successCallback is called with the new entry
 * @param {Function} errorCallback is called with a FileError
 */
DirectoryEntry.prototype.getFile = function(path, options, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "getFile", [this.fullPath, path, options]);
};

/**
 * Deletes a directory and all of it's contents
 * 
 * @param {Function} successCallback is called with no parameters
 * @param {Function} errorCallback is called with a FileError
 */
DirectoryEntry.prototype.removeRecursively = function(successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "removeRecursively", [this.fullPath]);
};

/**
 * An interface that lists the files and directories in a directory.
 */
DirectoryReader = function(fullPath){
	this.fullPath = fullPath || null;    
};

/**
 * Returns a list of entries from a directory.
 * 
 * @param {Function} successCallback is called with a list of entries
 * @param {Function} errorCallback is called with a FileError
 */
DirectoryReader.prototype.readEntries = function(successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "readEntries", [this.fullPath]);
}
 
/**
 * An interface representing a directory on the file system.
 * 
 * {boolean} isFile always true (readonly)
 * {boolean} isDirectory always false (readonly)
 * {DOMString} name of the file, excluding the path leading to it (readonly)
 * {DOMString} fullPath the absolute full path to the file (readonly)
 * {FileSystem} filesystem on which the directory resides (readonly)
 */
FileEntry = function() {
    this.isFile = true;
    this.isDirectory = false;
    this.name = null;
    this.fullPath = null;
    this.filesystem = null;
};

/**
 * Copies a file to a new location
 * 
 * @param {DirectoryEntry} parent the directory to which to copy the entry
 * @param {DOMString} newName the new name of the entry, defaults to the current name
 * @param {Function} successCallback is called with the new entry
 * @param {Function} errorCallback is called with a FileError
 */
FileEntry.prototype.copyTo = function(parent, newName, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "copyTo", [this.fullPath, parent, newName]);
};

/**
 * Looks up the metadata of the entry
 * 
 * @param {Function} successCallback is called with a Metadata object
 * @param {Function} errorCallback is called with a FileError
 */
FileEntry.prototype.getMetadata = function(successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "getMetadata", [this.fullPath]);
};

/**
 * Gets the parent of the entry
 * 
 * @param {Function} successCallback is called with a parent entry
 * @param {Function} errorCallback is called with a FileError
 */
FileEntry.prototype.getParent = function(successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "getParent", [this.fullPath]);
};

/**
 * Moves a directory to a new location
 * 
 * @param {DirectoryEntry} parent the directory to which to move the entry
 * @param {DOMString} newName the new name of the entry, defaults to the current name
 * @param {Function} successCallback is called with the new entry
 * @param {Function} errorCallback is called with a FileError
 */
FileEntry.prototype.moveTo = function(parent, newName, successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "moveTo", [this.fullPath, parent, newName]);
};

/**
 * Removes the entry
 * 
 * @param {Function} successCallback is called with no parameters
 * @param {Function} errorCallback is called with a FileError
 */
FileEntry.prototype.remove = function(successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "remove", [this.fullPath]);
};

/**
 * Returns a URI that can be used to identify this entry.
 * 
 * @param {DOMString} mimeType for a FileEntry, the mime type to be used to interpret the file, when loaded through this URI.
 * @param {Function} successCallback is called with the new entry
 * @param {Function} errorCallback is called with a FileError
 */
FileEntry.prototype.toURI = function(mimeType, successCallback, errorCallback) {
    return "file://localhost" + this.fullPath;
    //PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "toURI", [this.fullPath, mimeType]);
};

/**
 * Creates a new FileWriter associated with the file that this FileEntry represents.
 * 
 * @param {Function} successCallback is called with the new FileWriter
 * @param {Function} errorCallback is called with a FileError
 */
FileEntry.prototype.createWriter = function(successCallback, errorCallback) {
	this.file(function(filePointer) {	
		var writer = new FileWriter(filePointer);
		if (writer.fileName == null || writer.fileName == "") {
			if (typeof errorCallback == "function") {
				errorCallback({
					"code": FileError.INVALID_STATE_ERR
				});
		}
		}
		if (typeof successCallback == "function") {
			successCallback(writer);
		}       
	}, errorCallback);
};

/**
 * Returns a File that represents the current state of the file that this FileEntry represents.
 * 
 * @param {Function} successCallback is called with the new File object
 * @param {Function} errorCallback is called with a FileError
 */
FileEntry.prototype.file = function(successCallback, errorCallback) {
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.file", "getFileMetadata", [this.fullPath]);
};

/**
 * Add the FileSystem interface into the browser.
 */
PhoneGap.addConstructor(function() {
	var pgLocalFileSystem = new LocalFileSystem();
	// Needed for cast methods
    if(typeof window.localFileSystem == "undefined") window.localFileSystem  = pgLocalFileSystem;
    if(typeof window.requestFileSystem == "undefined") window.requestFileSystem  = pgLocalFileSystem.requestFileSystem;
    if(typeof window.resolveLocalFileSystemURI == "undefined") window.resolveLocalFileSystemURI = pgLocalFileSystem.resolveLocalFileSystemURI;
});
};




/*
 * Copyright (c) 2011, Matt Kane
 */

if (!PhoneGap.hasResource("filetransfer")) {
	PhoneGap.addResource("filetransfer");

/**
 * FileTransfer uploads a file to a remote server.
 */
FileTransfer = function() {}

/**
 * FileUploadResult
 */
FileUploadResult = function() {
    this.bytesSent = 0;
    this.responseCode = null;
    this.response = null;
}

/**
 * FileTransferError
 */
FileTransferError = function(errorCode) {
    this.code = errorCode || null;
}

FileTransferError.FILE_NOT_FOUND_ERR = 1;
FileTransferError.INVALID_URL_ERR = 2;
FileTransferError.CONNECTION_ERR = 3;

/**
* Given an absolute file path, uploads a file on the device to a remote server 
* using a multipart HTTP request.
* @param filePath {String}           Full path of the file on the device
* @param server {String}             URL of the server to receive the file
* @param successCallback (Function}  Callback to be invoked when upload has completed
* @param errorCallback {Function}    Callback to be invoked upon error
* @param options {FileUploadOptions} Optional parameters such as file name and mimetype           
*/
FileTransfer.prototype.upload = function(filePath, server, successCallback, errorCallback, options) {
	if(!options.params) {
		options.params = {};
	}
	options.filePath = filePath;
	options.server = server;
	if(!options.fileKey) {
		options.fileKey = 'file';
	}
	if(!options.fileName) {
		options.fileName = 'image.jpg';
	}
	if(!options.mimeType) {
		options.mimeType = 'image/jpeg';
	}
	
	// successCallback required
	if (typeof successCallback != "function") {
        console.log("FileTransfer Error: successCallback is not a function");
        return;
    }


    // errorCallback optional
    if (errorCallback && (typeof errorCallback != "function")) {
        console.log("FileTransfer Error: errorCallback is not a function");
        return;
    }
	
    PhoneGap.exec(successCallback, errorCallback, 'com.phonegap.filetransfer', 'upload', [options]);
};

FileTransfer.prototype._castTransferError = function(pluginResult) {
	var fileError = new FileTransferError(pluginResult.message);
	//fileError.code = pluginResult.message;
	pluginResult.message = fileError;
	return pluginResult;
}

FileTransfer.prototype._castUploadResult = function(pluginResult) {
	var result = new FileUploadResult();
	result.bytesSent = pluginResult.message.bytesSent;
	result.responseCode = pluginResult.message.responseCode;
	result.response = decodeURIComponent(pluginResult.message.response);
	pluginResult.message = result;
	return pluginResult;
}

/**
 * Downloads a file form a given URL and saves it to the specified directory.
 * @param source {String}          URL of the server to receive the file
 * @param target {String}         Full path of the file on the device
 * @param successCallback (Function}  Callback to be invoked when upload has completed
 * @param errorCallback {Function}    Callback to be invoked upon error
 */
FileTransfer.prototype.download = function(source, target, successCallback, errorCallback) {
	PhoneGap.exec(successCallback, errorCallback, 'com.phonegap.filetransfer', 'download', [source, target]);
};

/**
 * Options to customize the HTTP request used to upload files.
 * @param fileKey {String}   Name of file request parameter.
 * @param fileName {String}  Filename to be used by the server. Defaults to image.jpg.
 * @param mimeType {String}  Mimetype of the uploaded file. Defaults to image/jpeg.
 * @param params {Object}    Object with key: value params to send to the server.
 */
FileUploadOptions = function(fileKey, fileName, mimeType, params) {
    this.fileKey = fileKey || null;
    this.fileName = fileName || null;
    this.mimeType = mimeType || null;
    this.params = params || null;
}


PhoneGap.addConstructor(function() {
    if (typeof navigator.fileTransfer == "undefined") navigator.fileTransfer = new FileTransfer();
});
};
if (!PhoneGap.hasResource("geolocation")) {
	PhoneGap.addResource("geolocation");

/**
 * This class provides access to device GPS data.
 * @constructor
 */
Geolocation = function() {
    // The last known GPS position.
    this.lastPosition = null;
    this.listener = null;
    this.timeoutTimerId = 0;

};


/**
 * Asynchronously aquires the current position.
 * @param {Function} successCallback The function to call when the position
 * data is available
 * @param {Function} errorCallback The function to call when there is an error 
 * getting the position data.
 * @param {PositionOptions} options The options for getting the position data
 * such as timeout.
 * PositionOptions.forcePrompt:Bool default false, 
 * - tells iPhone to prompt the user to turn on location services.
 * - may cause your app to exit while the user is sent to the Settings app
 * PositionOptions.distanceFilter:double aka Number
 * - used to represent a distance in meters.
PositionOptions
{
   desiredAccuracy:Number
   - a distance in meters 
		< 10   = best accuracy  ( Default value )
		< 100  = Nearest Ten Meters
		< 1000 = Nearest Hundred Meters
		< 3000 = Accuracy Kilometers
		3000+  = Accuracy 3 Kilometers
		
	forcePrompt:Boolean default false ( iPhone Only! )
    - tells iPhone to prompt the user to turn on location services.
	- may cause your app to exit while the user is sent to the Settings app
	
	distanceFilter:Number
	- The minimum distance (measured in meters) a device must move laterally before an update event is generated.
	- measured relative to the previously delivered location
	- default value: null ( all movements will be reported )
	
}

 */
 
Geolocation.prototype.getCurrentPosition = function(successCallback, errorCallback, options) 
{
    // create an always valid local success callback
    var win = successCallback;
    if (!win || typeof(win) != 'function')
    {
        win = function(position) {};
    }
    
    // create an always valid local error callback
    var fail = errorCallback;
    if (!fail || typeof(fail) != 'function')
    {
        fail = function(positionError) {};
    }	

    var self = this;
    var totalTime = 0;
	var timeoutTimerId;
	
	// set params to our default values
	var params = new PositionOptions();
	
    if (options) 
    {
        if (options.maximumAge) 
        {
            // special case here if we have a cached value that is younger than maximumAge
            if(this.lastPosition)
            {
                var now = new Date().getTime();
                if((now - this.lastPosition.timestamp) < options.maximumAge)
                {
                    win(this.lastPosition); // send cached position immediately 
                    return;                 // Note, execution stops here -jm
                }
            }
            params.maximumAge = options.maximumAge;
        }
        if (options.enableHighAccuracy) 
        {
            params.enableHighAccuracy = (options.enableHighAccuracy == true); // make sure it's truthy
        }
        if (options.timeout) 
        {
            params.timeout = options.timeout;
        }
    }

    var successListener = win;
    var failListener = fail;
    if (!this.locationRunning)
    {
        successListener = function(position)
        { 
            win(position);
            self.stop();
        };
        errorListener = function(positionError)
        { 
            fail(positionError);
            self.stop();
        };
    }
    
    this.listener = {"success":successListener,"fail":failListener};
    this.start(params);
	
	var onTimeout = function()
	{
	    self.setError(new PositionError(PositionError.TIMEOUT,"Geolocation Error: Timeout."));
	};

    clearTimeout(this.timeoutTimerId);
    this.timeoutTimerId = setTimeout(onTimeout, params.timeout); 
};

/**
 * Asynchronously aquires the position repeatedly at a given interval.
 * @param {Function} successCallback The function to call each time the position
 * data is available
 * @param {Function} errorCallback The function to call when there is an error 
 * getting the position data.
 * @param {PositionOptions} options The options for getting the position data
 * such as timeout and the frequency of the watch.
 */
Geolocation.prototype.watchPosition = function(successCallback, errorCallback, options) {
	// Invoke the appropriate callback with a new Position object every time the implementation 
	// determines that the position of the hosting device has changed. 

	var self = this; // those == this & that
	
	var params = new PositionOptions();

    if(options)
    {
        if (options.maximumAge) {
            params.maximumAge = options.maximumAge;
        }
        if (options.enableHighAccuracy) {
            params.enableHighAccuracy = options.enableHighAccuracy;
        }
        if (options.timeout) {
            params.timeout = options.timeout;
        }
    }

	var that = this;
    var lastPos = that.lastPosition? that.lastPosition.clone() : null;
    
	var intervalFunction = function() {
        
		var filterFun = function(position) {
            if (lastPos == null || !position.equals(lastPos)) {
                // only call the success callback when there is a change in position, per W3C
                successCallback(position);
            }
            
            // clone the new position, save it as our last position (internal var)
            lastPos = position.clone();
        };
		
		that.getCurrentPosition(filterFun, errorCallback, params);
	};
	
    // Retrieve location immediately and schedule next retrieval afterwards
	intervalFunction();
	
	return setInterval(intervalFunction, params.timeout);
};


/**
 * Clears the specified position watch.
 * @param {String} watchId The ID of the watch returned from #watchPosition.
 */
Geolocation.prototype.clearWatch = function(watchId) {
	clearInterval(watchId);
};

/**
 * Called by the geolocation framework when the current location is found.
 * @param {PositionOptions} position The current position.
 */
Geolocation.prototype.setLocation = function(position) 
{
    var _position = new Position(position.coords, position.timestamp);

    if(this.timeoutTimerId)
    {
        clearTimeout(this.timeoutTimerId);
        this.timeoutTimerId = 0;
    }
    
	this.lastError = null;
    this.lastPosition = _position;
    
    if(this.listener && typeof(this.listener.success) == 'function')
    {
        this.listener.success(_position);
    }
    
    this.listener = null;
};

/**
 * Called by the geolocation framework when an error occurs while looking up the current position.
 * @param {String} message The text of the error message.
 */
Geolocation.prototype.setError = function(error) 
{
	var _error = new PositionError(error.code, error.message);

    this.locationRunning = false
	
    if(this.timeoutTimerId)
    {
        clearTimeout(this.timeoutTimerId);
        this.timeoutTimerId = 0;
    }
    
    this.lastError = _error;
    // call error handlers directly
    if(this.listener && typeof(this.listener.fail) == 'function')
    {
        this.listener.fail(_error);
    }
    this.listener = null;

};

Geolocation.prototype.start = function(positionOptions) 
{
    PhoneGap.exec(null, null, "com.phonegap.geolocation", "startLocation", [positionOptions]);
    this.locationRunning = true

};

Geolocation.prototype.stop = function() 
{
    PhoneGap.exec(null, null, "com.phonegap.geolocation", "stopLocation", []);
    this.locationRunning = false
};


PhoneGap.addConstructor(function() 
{
    if (typeof navigator._geo == "undefined") 
    {
        // replace origObj's functions ( listed in funkList ) with the same method name on proxyObj
        // this is a workaround to prevent UIWebView/MobileSafari default implementation of GeoLocation
        // because it includes the full page path as the title of the alert prompt
        var __proxyObj = function (origObj,proxyObj,funkList)
        {
            var replaceFunk = function(org,proxy,fName)
            { 
                org[fName] = function()
                { 
                   return proxy[fName].apply(proxy,arguments); 
                }; 
            };

            for(var v in funkList) { replaceFunk(origObj,proxyObj,funkList[v]);}
        }
        navigator._geo = new Geolocation();
        __proxyObj(navigator.geolocation, navigator._geo,
                 ["setLocation","getCurrentPosition","watchPosition",
                  "clearWatch","setError","start","stop"]);

    }

});
};
if (!PhoneGap.hasResource("compass")) {
	PhoneGap.addResource("compass");

CompassError = function(){
   this.code = null;
};

// Capture error codes
CompassError.COMPASS_INTERNAL_ERR = 0;
CompassError.COMPASS_NOT_SUPPORTED = 20;

CompassHeading = function() {
	this.magneticHeading = null;
	this.trueHeading = null;
	this.headingAccuracy = null;
	this.timestamp = null;
}	
/**
 * This class provides access to device Compass data.
 * @constructor
 */
Compass = function() {
    /**
     * List of compass watch timers
     */
    this.timers = {};
};

/**
 * Asynchronously acquires the current heading.
 * @param {Function} successCallback The function to call when the heading
 * data is available
 * @param {Function} errorCallback The function to call when there is an error 
 * getting the heading data.
 * @param {PositionOptions} options The options for getting the heading data (not used).
 */
Compass.prototype.getCurrentHeading = function(successCallback, errorCallback, options) {
 	// successCallback required
    if (typeof successCallback !== "function") {
        console.log("Compass Error: successCallback is not a function");
        return;
    }

    // errorCallback optional
    if (errorCallback && (typeof errorCallback !== "function")) {
        console.log("Compass Error: errorCallback is not a function");
        return;
    }

    // Get heading
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.geolocation", "getCurrentHeading", []);
};

/**
 * Asynchronously acquires the heading repeatedly at a given interval.
 * @param {Function} successCallback The function to call each time the heading
 * data is available
 * @param {Function} errorCallback The function to call when there is an error 
 * getting the heading data.
 * @param {HeadingOptions} options The options for getting the heading data
 * such as timeout and the frequency of the watch.
 */
Compass.prototype.watchHeading= function(successCallback, errorCallback, options) 
{
	// Default interval (100 msec)
    var frequency = (options !== undefined) ? options.frequency : 100;

    // successCallback required
    if (typeof successCallback !== "function") {
        console.log("Compass Error: successCallback is not a function");
        return;
    }

    // errorCallback optional
    if (errorCallback && (typeof errorCallback !== "function")) {
        console.log("Compass Error: errorCallback is not a function");
        return;
    }

    // Start watch timer to get headings
    var id = PhoneGap.createUUID();
    navigator.compass.timers[id] = setInterval(
        function() {
            PhoneGap.exec(successCallback, errorCallback, "com.phonegap.geolocation", "getCurrentHeading", [{repeats: 1}]);
        }, frequency);

    return id;
};


/**
 * Clears the specified heading watch.
 * @param {String} watchId The ID of the watch returned from #watchHeading.
 */
Compass.prototype.clearWatch = function(id) 
{
	// Stop javascript timer & remove from timer list
    if (id && navigator.compass.timers[id]) {
        clearInterval(navigator.compass.timers[id]);
        delete navigator.compass.timers[id];
    }
    if (navigator.compass.timers.length == 0) {
    	// stop the 
    	PhoneGap.exec(null, null, "com.phonegap.geolocation", "stopHeading", []);
    }
};

/** iOS only
 * Asynchronously fires when the heading changes from the last reading.  The amount of distance 
 * required to trigger the event is specified in the filter paramter.
 * @param {Function} successCallback The function to call each time the heading
 * data is available
 * @param {Function} errorCallback The function to call when there is an error 
 * getting the heading data.
 * @param {HeadingOptions} options The options for getting the heading data
 * 			@param {filter} number of degrees change to trigger a callback with heading data (float)
 *
 * In iOS this function is more efficient than calling watchHeading  with a frequency for updates.
 * Only one watchHeadingFilter can be in effect at one time.  If a watchHeadingFilter is in effect, calling
 * getCurrentHeading or watchHeading will use the existing filter value for specifying heading change. 
  */
Compass.prototype.watchHeadingFilter = function(successCallback, errorCallback, options) 
{
 
 	if (options === undefined || options.filter === undefined) {
 		console.log("Compass Error:  options.filter not specified");
 		return;
 	}

    // successCallback required
    if (typeof successCallback !== "function") {
        console.log("Compass Error: successCallback is not a function");
        return;
    }

    // errorCallback optional
    if (errorCallback && (typeof errorCallback !== "function")) {
        console.log("Compass Error: errorCallback is not a function");
        return;
    }
    PhoneGap.exec(successCallback, errorCallback, "com.phonegap.geolocation", "watchHeadingFilter", [options]);
}
Compass.prototype.clearWatchFilter = function() 
{
    	PhoneGap.exec(null, null, "com.phonegap.geolocation", "stopHeading", []);
};

PhoneGap.addConstructor(function() 
{
    if (typeof navigator.compass == "undefined") 
    {
        navigator.compass = new Compass();
    }
});
};

if (!PhoneGap.hasResource("media")) {
	PhoneGap.addResource("media");

/**
 * List of media objects.
 * PRIVATE
 */
PhoneGap.mediaObjects = {};

/**
 * Object that receives native callbacks.
 * PRIVATE
 */
PhoneGap.Media = function() {};


/**
 * Get the media object.
 * PRIVATE
 *
 * @param id            The media object id (string)
 */
PhoneGap.Media.getMediaObject = function(id) {
    return PhoneGap.mediaObjects[id];
};

/**
 * Audio has status update.
 * PRIVATE
 *
 * @param id            The media object id (string)
 * @param msg           The status message (int)
 * @param value        The status code (int)
 */
PhoneGap.Media.onStatus = function(id, msg, value) {
    var media = PhoneGap.mediaObjects[id];

    // If state update
    if (msg == Media.MEDIA_STATE) {
        if (value == Media.MEDIA_STOPPED) {
            if (media.successCallback) {
                media.successCallback();
            }
        }
        if (media.statusCallback) {
            media.statusCallback(value);
        }
    }
    else if (msg == Media.MEDIA_DURATION) {
        media._duration = value;
    }
    else if (msg == Media.MEDIA_ERROR) {
        if (media.errorCallback) {
            media.errorCallback(value);
        }
    }
    else if (msg == Media.MEDIA_POSITION) {
    	media._position = value;
    }
};

/**
 * This class provides access to the device media, interfaces to both sound and video
 *
 * @param src                   The file name or url to play
 * @param successCallback       The callback to be called when the file is done playing or recording.
 *                                  successCallback() - OPTIONAL
 * @param errorCallback         The callback to be called if there is an error.
 *                                  errorCallback(int errorCode) - OPTIONAL
 * @param statusCallback        The callback to be called when media status has changed.
 *                                  statusCallback(int statusCode) - OPTIONAL
 * @param positionCallback      The callback to be called when media position has changed.
 *                                  positionCallback(long position) - OPTIONAL
 */
Media = function(src, successCallback, errorCallback, statusCallback, positionCallback) {

    // successCallback optional
    if (successCallback && (typeof successCallback != "function")) {
        console.log("Media Error: successCallback is not a function");
        return;
    }

    // errorCallback optional
    if (errorCallback && (typeof errorCallback != "function")) {
        console.log("Media Error: errorCallback is not a function");
        return;
    }

    // statusCallback optional
    if (statusCallback && (typeof statusCallback != "function")) {
        console.log("Media Error: statusCallback is not a function");
        return;
    }

    // positionCallback optional -- NOT SUPPORTED
    if (positionCallback && (typeof positionCallback != "function")) {
        console.log("Media Error: positionCallback is not a function");
        return;
    }

    this.id = PhoneGap.createUUID();
    PhoneGap.mediaObjects[this.id] = this;
    this.src = src;
    this.successCallback = successCallback;
    this.errorCallback = errorCallback;
    this.statusCallback = statusCallback;
    this.positionCallback = positionCallback;
    this._duration = -1;
    this._position = -1;
};

// Media messages
Media.MEDIA_STATE = 1;
Media.MEDIA_DURATION = 2;
Media.MEDIA_POSITION = 3;
Media.MEDIA_ERROR = 9;

// Media states
Media.MEDIA_NONE = 0;
Media.MEDIA_STARTING = 1;
Media.MEDIA_RUNNING = 2;
Media.MEDIA_PAUSED = 3;
Media.MEDIA_STOPPED = 4;
Media.MEDIA_MSG = ["None", "Starting", "Running", "Paused", "Stopped"];

// TODO: Will MediaError be used?
/**
 * This class contains information about any Media errors.
 * @constructor
 */

MediaError = function() {
	this.code = null,
	this.message = "";
}

MediaError.MEDIA_ERR_ABORTED        = 1;
MediaError.MEDIA_ERR_NETWORK        = 2;
MediaError.MEDIA_ERR_DECODE         = 3;
MediaError.MEDIA_ERR_NONE_SUPPORTED = 4;

/**
 * Start or resume playing audio file.
 */
Media.prototype.play = function(options) {
    PhoneGap.exec(null, null, "com.phonegap.media", "play", [this.id, this.src, options]);
};

/**
 * Stop playing audio file.
 */
Media.prototype.stop = function() {
    PhoneGap.exec(null, null, "com.phonegap.media","stop", [this.id, this.src]);
};

/**
 * Pause playing audio file.
 */
Media.prototype.pause = function() {
    PhoneGap.exec(null, null, "com.phonegap.media","pause", [this.id, this.src]);
};

/**
 * Seek or jump to a new time in the track..
 */
Media.prototype.seekTo = function(milliseconds) {
    PhoneGap.exec(null, null, "com.phonegap.media", "seekTo", [this.id, this.src, milliseconds]);
};

/**
 * Get duration of an audio file.
 * The duration is only set for audio that is playing, paused or stopped.
 *
 * @return      duration or -1 if not known.
 */
Media.prototype.getDuration = function() {
    return this._duration;
};

/**
 * Get position of audio.
 *
 * @return
 */
Media.prototype.getCurrentPosition = function(successCB, errorCB) {
	var errCallback = (errorCB == undefined || errorCB == null) ? null : errorCB;
    PhoneGap.exec(successCB, errorCB, "com.phonegap.media", "getCurrentPosition", [this.id, this.src]);
};

// iOS only.  prepare/load the audio in preparation for playing
Media.prototype.prepare = function(successCB, errorCB) {
	PhoneGap.exec(successCB, errorCB, "com.phonegap.media", "prepare", [this.id, this.src]);
}

/**
 * Start recording audio file.
 */
Media.prototype.startRecord = function() {
    PhoneGap.exec(null, null, "com.phonegap.media","startAudioRecord", [this.id, this.src]);
};

/**
 * Stop recording audio file.
 */
Media.prototype.stopRecord = function() {
    PhoneGap.exec(null, null, "com.phonegap.media","stopAudioRecord", [this.id, this.src]);
};

/**
 * Release the resources.
 */
Media.prototype.release = function() {
    PhoneGap.exec(null, null, "com.phonegap.media","release", [this.id, this.src]);
};

};
if (!PhoneGap.hasResource("notification")) {
	PhoneGap.addResource("notification");

/**
 * This class provides access to notifications on the device.
 */
Notification = function() {
};

/**
 * Open a native alert dialog, with a customizable title and button text.
 *
 * @param {String} message              Message to print in the body of the alert
 * @param {Function} completeCallback   The callback that is called when user clicks on a button.
 * @param {String} title                Title of the alert dialog (default: Alert)
 * @param {String} buttonLabel          Label of the close button (default: OK)
 */
Notification.prototype.alert = function(message, completeCallback, title, buttonLabel) {
    var _title = title;
    if (title == null || typeof title === 'undefined') {
        _title = "Alert";
    }
    var _buttonLabel = (buttonLabel || "OK");
    PhoneGap.exec(completeCallback, null, "com.phonegap.notification", "alert", [message,{ "title": _title, "buttonLabel": _buttonLabel}]);
};

/**
 * Open a native confirm dialog, with a customizable title and button text.
 * The result that the user selects is returned to the result callback.
 *
 * @param {String} message              Message to print in the body of the alert
 * @param {Function} resultCallback     The callback that is called when user clicks on a button.
 * @param {String} title                Title of the alert dialog (default: Confirm)
 * @param {String} buttonLabels         Comma separated list of the labels of the buttons (default: 'OK,Cancel')
 */
Notification.prototype.confirm = function(message, resultCallback, title, buttonLabels) {
    var _title = (title || "Confirm");
    var _buttonLabels = (buttonLabels || "OK,Cancel");
    this.alert(message, resultCallback, _title, _buttonLabels);
};

/**
 * Causes the device to blink a status LED.
 * @param {Integer} count The number of blinks.
 * @param {String} colour The colour of the light.
 */
Notification.prototype.blink = function(count, colour) {
// NOT IMPLEMENTED	
};

Notification.prototype.vibrate = function(mills) {
	PhoneGap.exec(null, null, "com.phonegap.notification", "vibrate", []);
};

Notification.prototype.beep = function(count, volume) {
	// No Volume yet for the iphone interface
	// We can use a canned beep sound and call that
	new Media('beep.wav').play();
};

PhoneGap.addConstructor(function() {
    if (typeof navigator.notification == "undefined") navigator.notification = new Notification();
});
};
if (!PhoneGap.hasResource("orientation")) {
	PhoneGap.addResource("orientation");

/**
 * This class provides access to the device orientation.
 * @constructor
 */
Orientation  = function() {
	/**
	 * The current orientation, or null if the orientation hasn't changed yet.
	 */
	this.currentOrientation = null;
}

/**
 * Set the current orientation of the phone.  This is called from the device automatically.
 * 
 * When the orientation is changed, the DOMEvent \c orientationChanged is dispatched against
 * the document element.  The event has the property \c orientation which can be used to retrieve
 * the device's current orientation, in addition to the \c Orientation.currentOrientation class property.
 *
 * @param {Number} orientation The orientation to be set
 */
Orientation.prototype.setOrientation = function(orientation) {
    Orientation.currentOrientation = orientation;
    var e = document.createEvent('Events');
    e.initEvent('orientationChanged', 'false', 'false');
    e.orientation = orientation;
    document.dispatchEvent(e);
};

/**
 * Asynchronously aquires the current orientation.
 * @param {Function} successCallback The function to call when the orientation
 * is known.
 * @param {Function} errorCallback The function to call when there is an error 
 * getting the orientation.
 */
Orientation.prototype.getCurrentOrientation = function(successCallback, errorCallback) {
	// If the position is available then call success
	// If the position is not available then call error
};

/**
 * Asynchronously aquires the orientation repeatedly at a given interval.
 * @param {Function} successCallback The function to call each time the orientation
 * data is available.
 * @param {Function} errorCallback The function to call when there is an error 
 * getting the orientation data.
 */
Orientation.prototype.watchOrientation = function(successCallback, errorCallback) {
	// Invoke the appropriate callback with a new Position object every time the implementation 
	// determines that the position of the hosting device has changed. 
	this.getCurrentPosition(successCallback, errorCallback);
	return setInterval(function() {
		navigator.orientation.getCurrentOrientation(successCallback, errorCallback);
	}, 10000);
};

/**
 * Clears the specified orientation watch.
 * @param {String} watchId The ID of the watch returned from #watchOrientation.
 */
Orientation.prototype.clearWatch = function(watchId) {
	clearInterval(watchId);
};

Orientation.install = function()
{
    if (typeof navigator.orientation == "undefined") { 
		navigator.orientation = new Orientation();
	}
	
	var windowDispatchAvailable = !(window.dispatchEvent === undefined); // undefined in iOS 3.x
	if (windowDispatchAvailable) {
		return;
	} 
	
	// the code below is to capture window.add/remove eventListener calls on window
	// this is for iOS 3.x where listening on 'orientationchange' events don't work on document/window (don't know why)
	// however, window.onorientationchange DOES handle the 'orientationchange' event (sent through document), so...
	// then we multiplex the window.onorientationchange event (consequently - people shouldn't overwrite this)
	
	var self = this;
	var orientationchangeEvent = 'orientationchange';
	var newOrientationchangeEvent = 'orientationchange_pg';
	
	// backup original `window.addEventListener`, `window.removeEventListener`
    var _addEventListener = window.addEventListener;
    var _removeEventListener = window.removeEventListener;

	window.onorientationchange = function() {
		PhoneGap.fireEvent(newOrientationchangeEvent, window);
	}
	
    // override `window.addEventListener`
    window.addEventListener = function() {
        if (arguments[0] === orientationchangeEvent) {
			arguments[0] = newOrientationchangeEvent; 
		} 
													
		if (!windowDispatchAvailable) {
			return document.addEventListener.apply(this, arguments);
		} else {
			return _addEventListener.apply(this, arguments);
		}
    };	

    // override `window.removeEventListener'
    window.removeEventListener = function() {
        if (arguments[0] === orientationchangeEvent) {
			arguments[0] = newOrientationchangeEvent; 
		} 
		
		if (!windowDispatchAvailable) {
			return document.removeEventListener.apply(this, arguments);
		} else {
			return _removeEventListener.apply(this, arguments);
		}
    };	
};

PhoneGap.addConstructor(Orientation.install);

};
if (!PhoneGap.hasResource("sms")) {
	PhoneGap.addResource("sms");

/**
 * This class provides access to the device SMS functionality.
 * @constructor
 */
Sms = function() {

}

/**
 * Sends an SMS message.
 * @param {Integer} number The phone number to send the message to.
 * @param {String} message The contents of the SMS message to send.
 * @param {Function} successCallback The function to call when the SMS message is sent.
 * @param {Function} errorCallback The function to call when there is an error sending the SMS message.
 * @param {PositionOptions} options The options for accessing the GPS location such as timeout and accuracy.
 */
Sms.prototype.send = function(number, message, successCallback, errorCallback, options) {
	// not sure why this is here when it does nothing????
};

PhoneGap.addConstructor(function() {
    if (typeof navigator.sms == "undefined") navigator.sms = new Sms();
});
};
if (!PhoneGap.hasResource("telephony")) {
	PhoneGap.addResource("telephony");

/**
 * This class provides access to the telephony features of the device.
 * @constructor
 */
Telephony = function() {
	
}

/**
 * Calls the specifed number.
 * @param {Integer} number The number to be called.
 */
Telephony.prototype.call = function(number) {
	// not sure why this is here when it does nothing????
};

PhoneGap.addConstructor(function() {
    if (typeof navigator.telephony == "undefined") navigator.telephony = new Telephony();
});
};if (!PhoneGap.hasResource("network")) {
	PhoneGap.addResource("network");

// //////////////////////////////////////////////////////////////////

Connection = function() {
	/*
	 * One of the connection constants below.
	 */
	this.type = Connection.UNKNOWN;

	/* initialize from the extended DeviceInfo properties */
    try {      
		this.type	= DeviceInfo.connection.type;
    } 
	catch(e) {
    }
};

Connection.UNKNOWN = "unknown"; // Unknown connection type
Connection.ETHERNET = "ethernet";
Connection.WIFI = "wifi";
Connection.CELL_2G = "2g"; // the default for iOS, for any cellular connection
Connection.CELL_3G = "3g";
Connection.CELL_4G = "4g";
Connection.NONE = "none"; // NO connectivity


PhoneGap.addConstructor(function() {
    if (typeof navigator.network == "undefined") navigator.network = {};
    if (typeof navigator.network.connection == "undefined") navigator.network.connection = new Connection();
});

};if (!PhoneGap.hasResource("splashscreen")) {
	PhoneGap.addResource("splashscreen");

/**
 * This class provides access to the splashscreen
 */
SplashScreen = function() {
};

SplashScreen.prototype.show = function() {
    PhoneGap.exec(null, null, "com.phonegap.splashscreen", "show", []);
};

SplashScreen.prototype.hide = function() {
    PhoneGap.exec(null, null, "com.phonegap.splashscreen", "hide", []);
};

PhoneGap.addConstructor(function() {
    if (typeof navigator.splashscreen == "undefined") navigator.splashscreen = new SplashScreen();
});

};
/* MIT licensed */
// (c) 2010 Jesse MacFadyen, Nitobi

/*global PhoneGap */

function ChildBrowser() {
  // Does nothing
    this.isActive = false;
}

// Callback when the location of the page changes
// called from native
ChildBrowser._onLocationChange = function(newLoc)
{
  window.plugins.childBrowser.onLocationChange && window.plugins.childBrowser.onLocationChange(newLoc);
};

// Callback when the user chooses the 'Done' button
// called from native
ChildBrowser._onClose = function()
{
    window.plugins.childBrowser.isActive = false;
    window.plugins.childBrowser.onClose && window.plugins.childBrowser.onClose();
};

// Callback when the user chooses the 'open in Safari' button
// called from native
ChildBrowser._onOpenExternal = function()
{
  window.plugins.childBrowser.onOpenExternal && window.plugins.childBrowser.onOpenExternal();
};

// Pages loaded into the ChildBrowser can execute callback scripts, so be careful to
// check location, and make sure it is a location you trust.
// Warning ... don't exec arbitrary code, it's risky and could fuck up your app.
// called from native
ChildBrowser._onJSCallback = function(js,loc)
{
  // Not Implemented
  //window.plugins.childBrowser.onJSCallback(js,loc);
};

/* The interface that you will use to access functionality */

// Show a webpage, will result in a callback to onLocationChange
ChildBrowser.prototype.showWebPage = function(loc)
{
  if(!this.isActive)
  {
      PhoneGap.exec("ChildBrowserCommand.showWebPage", loc);
      this.isActive = true;
  }
  else
  {
      Log.info("oops, ChildBrowser is already active ...  consider calling close first.");
      
  }
};

// close the browser, will NOT result in close callback
ChildBrowser.prototype.close = function()
{
    
    PhoneGap.exec("ChildBrowserCommand.close");
    this.isActive = false;
};

// Not Implemented
ChildBrowser.prototype.jsExec = function(jsString)
{
  // Not Implemented!!
  //PhoneGap.exec("ChildBrowserCommand.jsExec",jsString);
};

// Note: this plugin does NOT install itself, call this method some time after deviceready to install it
// it will be returned, and also available globally from window.plugins.childBrowser
ChildBrowser.install = function()
{
  if (!window.plugins)
  {
    window.plugins = {};
  }

  if (!window.plugins.childBrowser)
  {
    window.plugins.childBrowser = new ChildBrowser();
  }
  return window.plugins.childBrowser;
};

(function (){
if (typeof exports === "undefined")
{
  eval("exports = window.xo = {}");
}
function statics(methods)
{
  for (var m in methods)
  {
    this[m] = methods[m];
  }
  return this;
}

var Class = exports.Class = function(superclass /*, mixins methods .... , */)
{
  var prototype;
  var i = 0;
  if (typeof superclass === "function")
  {
    function f(){}
    f.prototype = superclass.prototype;
    prototype = new f();
    prototype.constructor = function()
    {
      superclass.apply(this, arguments);
    }
    prototype.__proto__ = prototype.__proto__ || superclass.prototype;
    i++;
  }
  else
  {
    prototype =
    {
      constructor: function()
      {
      }
    };
  }
  var __super = prototype.__proto__;
  var len = arguments.length;
  if (i < len)
  {
    for (; i < len; i++)
    {
      var methods = arguments[i];
      for (var m in methods)
      {
        var method = methods[m];
        var name = method.name;
        if (name !== undefined && typeof method === "function")
        {
          var nlen = name.length;
          var body = method.toString();
          if (body[10 + nlen] === "_" && body.slice(0, 17 + nlen) === "function " + name + "(__super")
          {
            var supermethod = prototype[m];
            if (!supermethod)
            {
              throw new Error("Missing super method: " + m);
            }
            (function(supermethod, method)
            {
              prototype[m] = function()
              {
                var self = this;
                Array.prototype.unshift.call(arguments, function()
                {
                  return supermethod.apply(self, arguments);
                });
                return method.apply(self, arguments);
              };
            })(supermethod, method);
          }
          else
          {
            prototype[m] = method;
          }
        }
        else
        {
          prototype[m] = method;
        }
      }
    }
  }

  var constructor = prototype.constructor;
  constructor.prototype = prototype;
  constructor.statics = statics;
  prototype.classConstructor && prototype.classConstructor.call(constructor);
  return constructor;
};

var Mixin = exports.Mixin = function(/* mixins ... */)
{
  var prototype = {};
  for (var i = 0, len = arguments.length; i < len; i++)
  {
    var methods = arguments[i];
    for (var m in methods)
    {
      prototype[m] = methods[m];
    }
  }
  return prototype;
};

var Identity = exports.Identity = function(obj, fn)
{
  var id = obj.__xoid;
  if (!id)
  {
    id = obj.__xoid = fn ? fn() : "i" + Identity._nextId++;
  }
  return id;
}
Identity._nextId = 1;
var Events = exports.Events =
{
  addEventListener: function(events, fn, context)
  {
    var e = this.__info || (this.__info = {});
    events = events.split(" ");
    for (var event in events)
    {
      event = "event:" + events[event];
      var evt = e[event] || (e[event] = []);
      evt.push(fn, context);
      this.emit("newListener", event, fn);
    }
  },
  
  on: function(events, fn, context)
  {
    return this.addEventListener(events, fn, context);
  },

  once: function(event, fn, context)
  {
    var self = this;
    self.addEventListener(event, function ofn()
    {
      self.removeEventListener(event, ofn);
      fn.apply(context, arguments);
    });
  },

  removeEventListener: function(events, fn)
  {
    var e = this.__info;
    if (e)
    {
      events = events.split(" ");
      for (var event in events)
      {
        e = e["event:" + events[event]];
        if (e)
        {
          var i = e.indexOf(fn);
          if (i >= 0)
          {
            return e.splice(i, 2)[0] || null;
          }
        }
      }
    }
    return null;
  },

  removeAllListeners: function(event)
  {
    var e = this.__info;
    if (e)
    {
      delete e["event:" + event];
    }
  },

  listeners: function(event)
  {
    var e = this.__info;
    if (e)
    {
      return e["event:" + event] || [];
    }
    else
    {
      return [];
    }
  },

  emit: function(event /*, arguments ... */)
  {
    var i = this.__info;
    if (i)
    {
      var e = i["event:" + event];
      if (e && e.length)
      {
        for (var i = 0, len = e.length; i < len; i += 2)
        {
          try
          {
            e[i].apply(e[i+1], arguments);
          }
          catch (_)
          {
            Log.exception("emit", _);
          }
        }
        return true;
      }
    }
    return false;
  }
};
var Environment = exports.Environment =
{
  isTouch: function()
  {
    if (this._isTouch === undefined)
    {
      this._isTouch = "ontouchstart" in window;
    }
    return this._isTouch;
  },

  isPhoneGap: function()
  {
    return navigator.userAgent.indexOf("OS 5_") !== -1;
  },

  isRetina: function()
  {
    return window.devicePixelRatio > 1 ? true : false;
  }
};
var Log = exports.Log = Mixin({}, Events,
{
  _times: {},

  exception: function(message, exception)
  {
    if (!Log.emit("exception", [ message, exception ]))
    {
      if (exception)
      {
        Log.error("Exception: ", message, exception.stack || exception);
      }
      else
      {
        Log.error("Exception: ", message);
      }
    }
  },

  error: function()
  {
    Log._out("error", arguments);
  },

  warn: function()
  {
    Log._out("warn", arguments);
  },

  info: function()
  {
    Log._out("log", arguments);
  },
  
  log: function()
  {
    Log._out("log", arguments);
  },

  time: function(key)
  {
    Log._times[key] = Date.now();
  },

  timeEnd: function(key)
  {
    Log._times[key] && Log.timing(key, Date.now() - Log._times[key]);
    delete Log._times[key];
  },

  timing: function(key, time)
  {
    if (!Log.emit("timing", [ key, time ]))
    {
      Log.info(key, time + "ms");
    }
  },

  start: function()
  {
    Log._times.runtime = Date.now();
    Log.emit("start");
  },

  stop: function()
  {
    if (Log._times.runtime)
    {
      Log.timing("runtime", Date.now() - Log._times.runtime);
      delete Log._times.runtime;
      Log.emit("stop");
    }
  },

  _out: function(type, args)
  {
    if (!Log.emit(type, args))
    {
      if (Environment.isPhoneGap())
      {
        var m = "";
        for (var i = 0; i < args.length; i++)
        {
          var arg = args[i];
          if (arg === undefined)
          {
            m += "undefined ";
          }
          else if (arg === null)
          {
            m += "null ";
          }
          else
          {
            m += args[i].toString() + " ";
          }
        }
        console[type](m);
      }
      else
      {
        console[type].apply(console, args);
      }
    }
  },

  action: function(type, action, event)
  {
    Log.emit("action", { type: type, action: action, event: event });
  },

  metric: function(category, action, value, description)
  {
    if (!Log.emit("metric", { category: category, action: action, value: value, description: description }))
    {
      Log.info("Metric: " + category + "/" + action + (value === undefined ? "" : " " + value));
    }
  }
});

// Hookup fallback exception handling if supported
if (typeof window !== "undefined")
{
  window.onerror = function(message, url, linenr)
  {
    Log.exception("uncaughtException:" + (message ? " " + message : "") + " - " + linenr + ":" + url);
  }
}
else if (typeof process !== "undefiend")
{
  process.on("uncaughtException", function(e)
  {
    Log.exception("uncaughtException", e);
  });
}
/**
 * @fileOverview Co.Routine
 * @author <a href="mailto:tim.j.wilkinson@gmail.com">Tim Wilkinson</a>
 * @version 1.0.0
 */

/**
 * @namespace
 * Co.Routine provides a convienent way to manage the asynchronous nature of Javascript without resorting
 * highly nested function callbacks and messy error handling.
 */
var Co = exports.Co =
{
  /*
   * Use to track the currently executing co-routine.  Used internally to mange
   * co-routine nesting.
   */
  _current: null,
  
  /*
   * The context for each co-routine.
   */
  _co: function(context, start, functions, result)
  {
    this.result = result;
    this.exception = null;
    this.target = null;
    this.callbacks = null;
    this.running = false;
    this.context = context;
    this.start = start;
    this.pos = start;
    this.functions = functions;
  },
  
  /*
   * This function does the heavy lifting for the co-routine mechanism.  Essentially it runs each function of a co-routine
   * in turn, scheduling them so they execute when a result is available from the previous function (which probably arrives
   * asynchronously). 
   */
  _run: function(co)
  {
    var coproto = this._co.prototype;
    
    // Track the current co-routine we're executing (which allows us to nest them easily without
    // passing state around).
    var prev = Co._current;
    Co._current = co;
    
    // Note that we're running
    co.running = true;
    main: while (co.result !== undefined)
    {
      var context = co.context;
      var functions = co.functions;
      var len = functions.length;
      
      // Iterate through the functions in this co-routine in order until we execute all of them.
      while (co.pos < len)
      {
        try
        {
          // Not-null if we have a pending exception
          var cexception = co.exception;
          // Call the next function in the co-routine.  We pass as its argument a function
          // which returns the result from the previous co-routine function.  If this result
          // was an exception, the exception will be re-thrown immediately.
          var cresult = co.result;
          co.result = undefined;
          var result = functions[co.pos++].call(context, function()
          {
            // We read the result
            if (cexception)
            {
              // No longer have a pending exception
              co.exception = null;
              throw cexception;
            }
            else
            {
              return cresult;
            }
          });
          // If we have a pending exception, we ignore any result returned here and simply
          // pass the exception on to the next co-routine function until someone handles it.
          // Otherwise, ...
          if (!co.exception)
          {
            // If we dont have a result, and the result wasn't set by a callback, we suspend this co-routine
            if (result === undefined)
            {
              if (co.result === undefined)
              {
                // No exception either
                break main;
              }
            }
            // If we have an object (allow for null here), and the result is another co-routine, we inherit its result.
            else if (result && result.__proto__ === coproto)
            {
              co.result = result.result;
              co.exception = result.exception;
              // If the co-routine we're inheriting the result from doesn't actually have a result yet,
              // we mark its target as ourselves, so it will deliver a result once it has one.
              if (result.result === undefined)
              {
                result.target = co;
                // Which means we have no result currently, so this co-routine will suspend.
                break main;
              }
            }
            else
            {
              // Set the new result (which is not an exception which is caught below).
              co.result = result;
              co.exception = null;
            }
          }
          else
          {
            // Restore exception if still pending
            co.exception = cexception;
            co.result = cresult;
          }
        }
        catch (e)
        {
          // If we got an exception, this is the result which we pass to the next co-routine function.
          co.result = e;
          co.exception = e;
        }
        // Since we have a result now, we dont want to get a second result from any pending callbacks, so
        // clear them now.
        co.callbacks = null;
      }
      // Finished this co-routine
      
      // If this co-routine has no target, then we have no where to pass out current result to except our caller.
      if (!co.target)
      {
        break;
      }
      
      // If we do have a target, we will pass our result to it, and then start it running from its current position
      var nco = co.target;
      nco.result = co.result;
      nco.exception = co.exception;
      co.target = null;
      // Stop the old co-routine
      co.running = false;
      co = nco;
      // And start the new one.
      co.running = true;
      Co._current = co;
    }
    // This co-routine is no longer running
    co.running = false;
    
    Co._current = prev;
    
    // We return the co-routine's value to the caller if we've completed it.
    // If it's an exception, then throw it
    if (co.exception)
    {
      throw co.exception;
    }
    // If we have a result, then return it
    else if (co.result !== undefined)
    {
      return co.result
    }
    // If neither, we just return the co-routine itself so any later result can be retrieved
    else
    {
      return co;
    }
  },
  
  /**
   * Create and execute a co-routine.
   *
   * @param context The value of 'this' for each function to be executed with.
   * @param {Function} fns___ One or more additional arguments, each a function, which is executed in turn as part of the co-routine.
   * @returns The result of the co-routine.
   */
  Routine: function(context, fns___)
  {
    return this._run(new Co._co(context, 1, arguments, null));
  },
  
  /**
   * Wrap a callback function to the result is return into a specific co-routine.
   *
   * @param context The value of 'this' for each function to be executed with.
   * @param {Function} fn The callback function to be wrapped in the current co-routine.
   * @returns {Function} The wrapped function.
   * @throws An error if one is pending from the last co-routine function.
   */
  Callback: function(context, fn)
  {
    var co = Co._current;
    // We dont allow the creation of callbacks if we have a pending exception (since this
    // makes it possible to loose that exception before its re-thrown).
    if (co.exception)
    {
      throw co.exception;
    }
    // Keep a linked-list of callbacks for this co-routine.
    var link =
    {
      next: co.callbacks
    }
    co.callbacks = link;
    
    // Return a function which will call the passed in function, but will return its value into the current co-routine.
    return function()
    {
      // Track the current co-routine we're executing (which allows us to nest them easily without
      // passing state around).
      var prev = Co._current;
      Co._current = co;

      // Only execute a callback if the co-routine still has it on its callback list.  This
      // prevents old callbacks sending results to co-routines which have already moved ahead.
      for (var ptr = co.callbacks; ptr; ptr = ptr.next)
      {
        if (ptr === link)
        {
          // Execute the wrapped function and record the result.
          try
          {
            co.result = fn.apply(context, arguments);
          }
          catch (e)
          {
            co.result = e;
            co.exception = e;
          }
          // If we have a result, clear the callbacks so no other callbacks will be processed.
          if (co.result !== undefined)
          {
            co.callbacks = null;
            // If the co-routine isnt running, then this new result will restart it.  If the co-routine is
            // currently running, it will process the result in due course, so we dont have to restart it.
            if (!co.running)
            {
              try
              {
                Co._run(co);
              }
              catch (e)
              {
                // An exception from a restarted co-routine was never processed and is lost.  We report it.
                Log.exception("Lost CoRoutine exception", e);
              }
            }
          }
          break;
        }
      }

      Co._current = prev;
    }
  },
  
  /**
   * Break out of the current co-routine.
   * This jumps the execution to the end of the co-routine.  If the Co.Break includes a
   * value, this becomes the result of the co-routine.
   *
   * @param [result] Result value to exit the co-routine with.
   * @returns A defined value which should be returns from a function in the co-routine.
   *
   * @example
   * // A simple use of Co.Break to quite a loop.
   * Co.Forever(this,
   *   function()
   *   {
   *     // Immediately break out of this forever loop.
   *     return Co.Break();
   *   }
   * )
   */
  Break: function(result)
  {
    this._current.pos = this._current.functions.length;
    return result !== undefined ? result : null;
  },
  
  /**
   * Continue the current co-routine.
   * This jumps the execution to the beginning of the co-routine.  If the Co.Continue includes a
   * value, this becomes the initial value of the co-routine.
   *
   * @param [result] Initial value to restart the co-routine with.
   * @returns A defined value which should be returns from a function in the co-routine.
   */
  Continue: function(result)
  {
    this._current.pos = this._current.start;
    return result !== undefined ? result : null;
  },
  
  /**
   * Loop over the functions a given number of times.
   *
   * @param context The value of 'this' for each function to be executed with.
   * @param count The number of times to execute the functions.
   * @param {Function} fns___ One or more additional arguments, each a function, which is executed in turn as part of the co-routine.
   * @returns The result of the co-routine.
   */
  Loop: function(context, count, fns___)
  {
    if (count === 0)
    {
      return null;
    }
    else
    {
      var i = 0;
      var fns = Array.prototype.slice.call(arguments, 2).concat(function(r)
      {
        r = r();
        return ++i < count ? Co.Continue(i) : Co.Break(r);
      });
      return Co._run(new Co._co(context, 0, fns, i));
    }
  },
  
  /**
   * Loop over the functions forever.
   *
   * @param context The value of 'this' for each function to be executed with.
   * @param {Function} fns___ One or more additional arguments, each a function, which is executed in turn as part of the co-routine.
   * @returns The result of the co-routine.
   */
  Forever: function(context, fns___)
  {
    var fns = Array.prototype.slice.call(arguments, 1).concat(function(r)
    {
      r();
      return Co.Continue();
    });
    return Co._run(new Co._co(context, 0, fns, null));
  },
  
  /**
   * Execute a set of co-routine function, in parallel, for each value in the array.
   * A Co.Foreach co-routine is not complete until all array values have been processed and completed.
   *
   * @param context The value of 'this' for each function to be executed with.
   * @param array The array of values to be processed by the co-routine functions.
   * @param {Function} fns___ One or more additional arguments, each a function, which is executed in turn as part of the co-routine.
   * @returns The result of the co-routine.
   */
  Foreach: function(context, array, fns___)
  {
    var count = 1;
    var results = [];
    var exception = false;
    function done()
    {
      if (exception)
      {
        exception = new Error("Co.Foreach");
        exception.results = results;
        throw exception;
      }
      else
      {
        return results;
      }
    }
    var fns = Array.prototype.slice.call(arguments, 2).concat(function(r)
    {
      try
      {
        results[Co._current.index] = r();
      }
      catch (e)
      {
        exception = true;
        results[Co._current.index] = e;
      }
      return !--count && done() || undefined;
    });
    return Co.Routine(this,
      function()
      {
        var current = Co._current;
        for (var i = 0, len = array.length; i < len; i++)
        {
          count++;
          var co = new Co._co(context, 0, fns, array[i]);
          co.index = i;
          co.target = current;
          Co._run(co);
        }
        return !--count && done() || undefined;
      }
    );
  },
  
  /**
   * Execute each function, in parallel, as a seperate co-routine.
   * A Co.Parallel co-routine is not complete until all functions have completed.
   *
   * @param context The value of 'this' for each function to be executed with.
   * @param {Function} fns___ One or more additional arguments, each a function, which is executed in turn as part of the co-routine.
   * @returns The result of the co-routine.
   */
  Parallel: function(context, fns___)
  {
    var args = arguments;
    var count = 1;
    var results = [];
    var exception = false;
    function done()
    {
      if (exception)
      {
        exception = new Error("Co.Parallel");
        exception.results = results;
        throw exception;
      }
      else
      {
        return results;
      }
    }
    return Co.Routine(this,
      function()
      {
        var current = Co._current;
        for (var i = 1, len = args.length; i < len; i++)
        {
          var co = new Co._co(context, 0, 
          [ 
            args[i],
            function(r)
            {
              try
              {
                results[Co._current.index] = r();
              }
              catch (e)
              {
                exception = true;
                results[Co._current.index] = e;
              }
              return !--count && done() || undefined;
            } 
          ], null);
          count++;
          co.index = i - 1;
          co.target = current;
          Co._run(co);
        }
        return !--count && done() || undefined;
      }
    );
  },
  
  /**
   * Yield the current co-routine and give something else the chance to run.
   */
  Yield: function()
  {
    setTimeout(Co.Callback(this, function()
    {
      return { yield: true };
    }), 0);
  },
  
  /**
   * Make the current co-routine sleep for a given number of seconds.
   *
   * @param timeInSecs The number of seconds to sleep.
   */
  Sleep: function(timeInSecs)
  {
    setTimeout(Co.Callback(this, function()
    {
      return { slept: timeInSecs };
    }), timeInSecs * 1000);
  },
  
  /**
   * Wrap a traditional callback-style function so we can use it easily in a co-routine.
   *
   * <p>
   * Most traditional JS apis use a callback notation for async reponses.  This method provides
   * a simple, flexible way to wrap those they they can be used as 'normal' function inside a co-routine.
   * </p>
   * <p>
   * The 'desc' parameter is a a string of the following characters: 0-9,S,E,N.  The position of the
   * character maps to the location of the argument in the wrapped function, while its value either refers to
   * the position of the incoming argument (0-9) or marks a callback function.  Three types of callbacks are supported,
   * 'S' is a success callback (which results in a returned value), 'E' marks an error callback (which results in an
   * exception being thrown), and 'N' marks a NodeJS style callback (which gets two arguments, the first being a potential
   * exception object, the second being the return value).
   * </p>
   *
   * @param context The value of 'this' for each function to be executed with.
   * @param {Function} func The function to wrap so we can call it easily in a co-routine.
   * @param {String: 0-9,S,E,N} desc A string describing how to map the given function to a co-routine-ized function.
   * @returns {Function} The co-routine-ized function.
   *
   * @example
   * funtion simple(val, callback)
   * {
   *   callback(val);
   * }
   * var coFn = Co.Function(this, simple, "0S");
   */
  Function: function(context, func, desc)
  {
    var len = desc.length;
    
    // Return a function which we can simply call in a co-routine.  Callbacks are mapped to Co.Callbacks so
    // their results are returned into the current co-routine.
    return function()
    {
      var myargs = arguments;
      return Co.Routine(this,
        function()
        {
          var args = [];
          for (var i = 0; i < len; i++)
          {
            switch (desc[i])
            {
              // Simple arguments.
              case "0":
              case "1":
              case "2":
              case "3":
              case "4":
              case "5":
              case "6":
              case "7":
              case "8":
              case "9":
                args[i] = myargs[desc[i] | 0];
                break;
                
              // Define a success argument.  This is called by the native function on success and is
              // mapped to a returned result in the current co-routine.
              case "S":
                args[i] = Co.Callback(null, function()
                {
                  switch (arguments.length)
                  {
                    case 0:
                      return null;
                    case 1:
                      return arguments[0] === undefined ? null : arguments[0];
                    default:
                      return Array.prototype.slice.call(arguments, 0);
                  }
                });
                break;
                
              // Define an exception argument.  This is called by the native function on an error and is
              // mapped to an exception in the current co-routine.
              case "E":
                args[i] = Co.Callback(null, function()
                {
                  var e = new Error(arguments[0]);
                  switch (arguments.length)
                  {
                    case 0:
                      e.result = null;
                      break;
                    case 1:
                      e.result = arguments[0];
                      break;
                    default:
                      e.result = Array.prototype.slice.call(arguments, 0);
                      break;
                  }
                  throw e;
                });
                break;
                
              // NodeJS callback convension.  Many NodeJS functions have a callback with two
              // arguments.  The first, if defined, is the exception.  The second is the result.
              case "N":
                args[i] = Co.Callback(null, function(e, r)
                {
                  if (e)
                  {
                    throw e;
                  }
                  else
                  {
                    return r !== undefined ? r : null;
                  }
                });
                break;
                
              default:
                throw new Error("Unrecognized desc[" + i + "]: " + desc[i]);
            }
          }
          // Call the function with the newly mapped arguments
          func.apply(context, args);
        }
      );
    }
  },

  /**
   * Build a simple return function which we can use for common function callbacks.
   */
  Return: function()
  {
    return Co.Callback(null, function(r)
    {
      return r !== undefined ? r : null;
    });
  },

  /**
   * Build a simple return function which we can use for common function callbacks which return
   * multiple values.
   */
  ReturnN: function()
  {
    return Co.Callback(null, function()
    {
      return Array.prototype.slice.call(arguments);
    });
  },

  /**
   * Build a simple return function which we can use for common NodeJS function callbacks.
   * NodeJS callback convension.  Many NodeJS functions have a callback with two
   * arguments.  The first, if defined, is the exception.  The second is the result.
   */
  ReturnNode: function()
  {
    return Co.Callback(null, function(e, r)
    {
      if (e)
      {
        throw e;
      }
      else
      {
        return r !== undefined ? r : null;
      }
    });
  },

  /**
   * Place a lock on the context and prevent more than one locked co-routine from executing using that context.
   *
   * @param context The value of 'this' for each function to be executed with, and also the object to lock.
   * @param {Function} fns___ One or more additional arguments, each a function, which is executed in turn as part of the co-routine.
   * @returns The result of the co-routine.
   */
  Lock: function(context, fns___)
  {
    var args = arguments;
    return Co.Routine(this,
      function()
      {
        if (!context.__coroutine_lock)
        {
          context.__coroutine_lock = [];
          return true;
        }
        else
        {
          context.__coroutine_lock.push(Co.Callback(this, function()
          {
            return true;
          }));
        }
      },
      function()
      {
        return this._run(new Co._co(context, 1, args, null));
      },
      function(r)
      {
        if (context.__coroutine_lock.length)
        {
          context.__coroutine_lock.shift()();
        }
        else
        {
          context.__coroutine_lock = null;
        }
        return r();
      }
    );
  }
};
var LRU = exports.LRU = Class(Events,
{
  constructor: function(size)
  {
    this._size = size;
    this._hash = {};
    this._queue = [];
  },

  get: function(key, fn, ctx)
  {
    var item = this._hash[key];
    if (!item)
    {
      if (fn)
      {
        item = fn.call(ctx, key);
        if (item !== undefined)
        {
          this._hash[key] = item;
          this._queue.unshift(key);
          if (this._queue.length > this._size)
          {
            var ekey = this._queue.slice(-1);
            var eobj = this._hash[ekey];
            delete this._hash[ekey];
            this.emit("evict", ekey, eobj);
            this._queue.length = this._size;
          }
        }
      }
    }
    else
    {
      var idx = this._queue.indexOf(key);
      if (idx !== 0)
      {
        this._queue.splice(idx, 1);
        this._queue.unshift(key);
      }
    }
    return item;
  },

  add: function(key, item)
  {
    this._hash[key] = item;
    var idx = this._queue.indexOf(key);
    if (idx !== -1)
    {
      this._queue.splice(idx, 1);
      this._queue.unshift(key);
    }
    else if (idx !== 0)
    {
      this._queue.unshift(key);
      if (this._queue.length > this._size)
      {
        var ekey = this._queue.slice(-1);
        var eobj = this._hash[ekey];
        delete this._hash[ekey];
        this.emit("evict", ekey, eobj);
        this._queue.length = this._size;
      }
    }
  },

  remove: function(key)
  {
    var item = this._hash[key];
    if (item)
    {
      delete this._hash[key];
      this._queue.splice(this._queue.indexOf(key));
      return item;
    }
    else
    {
      return null;
    }
  },

  keys: function()
  {
    return Object.keys(this._hash);
  }
});
var Uuid = exports.Uuid =
{
  create: function()
  {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c)
    {
        var r = Math.random() * 16 | 0;
        var v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
  }
};
function _ModelProperty(prop)
{
  return Model.makeProperty(prop);
}
function _ModelROProperty(prop)
{
  return Model.makeROProperty(prop);
}
var Model = exports.Model = Class(Events,
{
  classConstructor: function()
  {
    var prototype = this.prototype;
    for (var prop in prototype)
    {
      var p = prototype[prop];
      if (p === _ModelProperty)
      {
        prototype[prop] = Model.makeProperty(prop);
      }
      else if (p === _ModelROProperty)
      {
        prototype[prop] = Model.makeROProperty(prop);
      }
    }
  },

  constructor: function(values)
  {
    this._values = values || {};
    this.sequence = Model.nextSequence();
  },

  property: function(name, value)
  {
    if (!(name in this))
    {
      this[name] = Model.makeProperty(name);
    }
    return arguments.length === 1 ? this[name]() : this[name](value);
  },

  emit: function(evt)
  {
    if (evt === "update")
    {
      this.sequence = Model.nextSequence();
    }
    Events.emit.apply(this, arguments);
  },

  delayUpdate: function(fn)
  {
    var pending = false;
    try
    {
      this.emit = function(event)
      {
        if (event === "update")
        {
          pending = true;
        }
        else
        {
          this.__proto__.emit.apply(this, arguments);
        }
      }
      fn.call(this);
    }
    finally
    {
      delete this.emit;
      if (pending)
      {
        this.emit("update");
      }
    }
  },

  update: function(properties)
  {
    var self = this;
    self.delayUpdate(function()
    {
      for (var prop in properties)
      {
        self[prop](properties[prop]);
      }
    });
  },

  serialize: function()
  {
    return this._values;
  }
}).statics(
{
  _nextId: 1,
  _nextSeq: 1,

  Property: _ModelProperty,
  ROProperty: _ModelROProperty,

  create: function(methods)
  {
    return Class(Model, methods);
  },
  
  identity: function(model)
  {
    return Identity(model, function()
    {
      return "m" + Model._nextId++;
    });
  },

  makeProperty: function(prop)
  {
    return new Function("v",
      "var ov = this._values." + prop + ";if (arguments.length && v !== ov) { this._values." + prop + " = v; this.emit('update." + prop + "'); this.emit('update'); } return ov;"
    );
  },

  makeROProperty: function(prop)
  {
    return new Function(
      "if (arguments.length) { throw new Error('Read-only property: " + prop + "'); } return this._values." + prop + ";"
    );
  },

  updateProperty: function(obj, propname, value)
  {
    var ov = obj._values[propname];
    if (arguments.length === 3 && value !== ov)
    {
      obj._values[propname] = value;
      obj.emit("update." + propname);
      obj.emit("update");
    }
    return ov;
  },

  isInstanceOf: function(m)
  {
    for (; m; m = m.__proto__)
    {
      if (m.__proto__ === Model.prototype)
      {
        return true;
      }
    }
    return false;
  },

  nextSequence: function()
  {
    return this._nextSeq++;
  }
});
var ModelSet = exports.ModelSet = Class(Model,
{
  constructor: function(values)
  {
    values = values || {};
    this._values = values;
    this.models = values.models || [];
    this._limit = values.limit;
    this.sequence = Model.nextSequence();
  },

  length: function()
  {
    return this.models.length;
  },

  forEach: function(fn, ctx)
  {
    return this.models.forEach(fn, ctx);
  },

  indexOf: function(model)
  {
    return this.models.indexOf(model);
  },

  findByProperty: function(name, value)
  {
    var models = this.models;
    for (var i = 0, len = models.length; i < len; i++)
    {
      if (models[i][name]() === value)
      {
        return models[i];
      }
    }
    return null;
  },

  insertAt: function(idx, model)
  {
    var count;
    if (idx < 0)
    {
      idx += this.models.length + 1;
    }
    if (Array.isArray(model))
    {
      this.models.splice.apply(this.models, [ idx, 0 ].concat(model));
      count = model.length;
      this.emit("insert",
      {
        index: idx,
        count: count,
        models: model
      });
    }
    else
    {
      this.models.splice(idx, 0, model);
      count = 1;
      this.emit("insert",
      {
        index: idx,
        count: count,
        models: [ model ]
      });
    }
    if (this._limit && this.models.length > this._limit)
    {
      var m = this.models.splice(this._limit);
      this.emit("truncate",
      {
        models: m,
        count: m.length
      });
    }
    return count;
  },

  emit: function(evt)
  {
    switch (evt)
    {
      case "insert":
      case "remove":
      case "truncate":
        this.sequence = Model.nextSequence();
        break;
    }
    Model.prototype.emit.apply(this, arguments);
  },

  prepend: function(model)
  {
    return this.insertAt(0, model);
  },

  append: function(model)
  {
    return this.insertAt(-1, model);
  },

  remove: function(model)
  {
    if (Array.isArray(model))
    {
      var fidx = -1;
      var count = 0;
      var total = 0;
      model.forEach(function(m)
      {
        var idx = this.indexOf(m);
        if (idx !== -1)
        {
          total++;
          if (fidx === -1)
          {
            fidx = idx;
            count = 1;
          }
          else if (idx === fidx + count)
          {
            count++;
          }
          else
          {
            var removed = this.models.splice(fidx, count);
            this.emit("remove",
            {
              index: fidx,
              count: count,
              models: removed
            });
            fidx = idx < fidx ? idx : idx - count;
            count = 1;
          }
        }
      }, this);
      if (count)
      {
        var removed = this.models.splice(fidx, count);
        this.emit("remove",
        {
          index: fidx,
          count: count,
          models: removed
        });
      }
      return total;
    }
    else
    {
      var idx = this.indexOf(model);
      if (idx !== -1)
      {
        this.models.splice(idx, 1);
        this.emit("remove",
        {
          index: idx,
          count: 1,
          models: [ model ]
        });
        return 1;
      }
    }
    return 0;
  },

  removeAll: function()
  {
    var len = this.models.length;
    if (len)
    {
      var removed = this.models.splice(0, len);
      this.emit("remove",
      {
        index: 0,
        count: len,
        models: removed
      });
      return true;
    }
    else
    {
      return false;
    }
  },

  serialize: function()
  {
    var ms = [];
    this.forEach(function(m)
    {
      ms.push(m.serialize());
    });
    return ms;
  }
}).statics(
{
  create: function(methods)
  {
    return Class(ModelSet, methods);
  },

  isInstanceOf: function(m)
  {
    for (; m; m = m.__proto__)
    {
      if (m.__proto__ === ModelSet.prototype)
      {
        return true;
      }
    }
    return false;
  }
});
var IndexedModelSet = exports.IndexedModelSet = Class(ModelSet,
{
  constructor: function(__super, values)
  {
    if (values.key)
    {
      this._key = values.key;
      this._index = {};
    }
    __super(values);
  },

  findByProperty: function(__super, name, value)
  {
    if (name === this._key)
    {
      return this._index[value] || null;
    }
    else
    {
      return __super(name, value);
    }
  },

  insertAt: function(__super, idx, model)
  {
    var key = this._key;
    if (key)
    {
      var index = this._index;
      if (Array.isArray(model))
      {
        var models = [];
        model.forEach(function(m)
        {
          var k = m[key]();
          if (!(k in index))
          {
            index[k] = m;
            models.push(m);
          }
        });
        return models.length ? __super(idx, models) : 0;
      }
      else
      {
        var k = model[key]();
        if (k in index)
        {
          return 0;
        }
        else
        {
          index[k] = model;
          return __super(idx, model);
        }
      }
    }
    else
    {
      return __super(idx, model);
    }
  },

  remove: function(__super, model)
  {
    var key = this._key;
    if (key)
    {
      var index = this._index;
      if (Array.isArray(model))
      {
        model.forEach(function(m)
        {
          delete index[m[key]()];
        });
      }
      else
      {
        delete index[model[key]()];
      }
    }
    return __super(model);
  },

  removeAll: function(__super)
  {
    this._index = {};
    __super();
  }
});
var FilteredModelSet = exports.FilteredModelSet = Class(IndexedModelSet,
{
  constructor: function(__super, values)
  {
    this._include = [];
    this._exclude = [];
    __super(values);
  },

  insertAt: function(__super, idx, model)
  {
    if (Array.isArray(model))
    {
      var filtered = [];
      var passed = [];
      model.forEach(function(m)
      {
        if (this.filter(m))
        {
          passed.push(m);
        }
        else
        {
          filtered.push(m);
        }
      }, this);
      var count = 0;
      if (passed.length)
      {
        count = __super(idx, passed);
      }
      if (filtered.length)
      {
        this.emit("filtered",
        {
          models: filtered
        });
      }
      return count;
    }
    else
    {
      if (this.filter(model))
      {
        return __super(idx, model);
      }
      else
      {
        this.emit("filtered",
        {
          models: [ model ]
        });
        return 0;
      }
    }
  },

  addIncludeFilter: function(fn, refilter)
  {
    if (this._include.indexOf(fn) === -1)
    {
      this._include.push(fn);
      this.emit("filterChange");
      if (this._include.length === 1 && refilter !== false)
      {
        return this._filterNow();
      }
    }
    return null;
  },

  addExcludeFilter: function(fn, refilter)
  {
    if (this._exclude.indexOf(fn) === -1)
    {
      this._exclude.push(fn);
      this.emit("filterChange");
      if (refilter !== false)
      {
        return this._filterNow();
      }
    }
    return null;
  },

  removeIncludeFilter: function(fn, refilter)
  {
    var idx = this._include.indexOf(fn);
    if (idx !== -1)
    {
      this._include.splice(idx, 1);
      this.emit("filterChange");
      if (this._include.length && refilter !== false)
      {
        return this._filterNow();
      }
    }
    return null;
  },

  removeExcludeFilter: function(fn)
  {
    var idx = this._exclude.indexOf(fn);
    if (idx !== -1)
    {
      this._exclude.splice(idx, 1);
      this.emit("filterChange");
    }
    return null;
  },

  _filterNow: function()
  {
    var remove = [];
    this.forEach(function(m)
    {
      if (!this.filter(m))
      {
        remove.push(m);
      }
    }, this);
    if (remove.length)
    {
      this.remove(remove);
      this.emit("filtered",
      {
        models: remove
      });
    }
    return remove;
  },

  filter: function(model)
  {
    var filters = this._include;
    if (filters.length)
    {
      for (var i = 0, len = filters.length; i < len; i++)
      {
        if (filters[i].call(this, model))
        {
          break;
        }
      }
      if (i === len)
      {
        return false;
      }
    }
    filters = this._exclude;
    for (var i = 0, len = filters.length; i < len; i++)
    {
      if (filters[i].call(this, model))
      {
        return false;
      }
    }
    return true;
  }
});
var View = exports.View = Class(Model,
{
  constructor: function(__super, args)
  {
    var self = this;
    __super(args);
    self.$name = args.name;
    self.$depth = 0;
    self.$node = null;
    self.$className = args.className || "view";
    self.$style = args.style;
    self.$model = args.model;
    self.$renderer = args.renderer;
    self.$cursor = args.cursor ? args.cursor.clone([ self.$model, self ]) : new Template.Cursor([ self.$model, self ]);
    self.$updateHandler = function(evt)
    {
      RenderQ.add(self);
    };
    self._unhandlers = [];
    if (args.updateOn)
    {
      args.updateOn.split(" ").forEach(function(name)
      {
        self.$model.addEventListener && self.addListener(self.$model, "update." + name, self.$updateHandler);
        self.addListener(self, "update." + name, self.$updateHandler);
      });
    }
    else
    {
      self.$model.addEventListener && self.addListener(self.$model, "update", self.$updateHandler);
      self.addListener(self, "update", self.$updateHandler);
    }
    var properties = args.properties;
    if (properties)
    {
      for (var p in properties)
      {
        self.property(p, properties[p]);
      }
    }
  },

  destructor: function()
  {
    this.$node = null;
    this._removeAllUnhandlers();
  },

  html: function()
  {
    return '<div ' + this.htmlOptions() + '>' + this.innerHtml() + '</div>';
  },

  htmlOptions: function()
  {
    return 'class="' + this.$className + (this.$style ? '" style="' + this.$style : '') + '" data-view="' + this.identity() + '"' + (this.$name ? ' data-name="' + this.$name + '"' : '')
  },

  innerHtml: function()
  {
    return this.$renderer(this.$cursor);
  },

  node: function()
  {
    if (!this.$node)
    {
      this.$node = document.querySelector('[data-view="' + this.identity() + '"]');
      var depth = 1;
      for (var node = this.$node; node; node = node.parentNode)
      {
        depth++;
      }
      this.$depth = depth;
    }
    else if (this.$node.compareDocumentPosition(document) & 1)
    {
      this.$node = null;
    }
    return this.$node;
  },

  stage: function()
  {
    if (!this._stage)
    {
      this._stage = document.createElement("div");
    }
    return this._stage;
  },

  action: function(name, evt)
  {
    evt = evt || {};
    evt.type = name;
    evt.target = evt.target || this.node();
    evt.view = evt.view || this;
    return RootView._onEvent(evt);
  },

  identity: function()
  {
    return View.buildIdentity(this.$renderer, this.$model);
  },

  addListener: function(node, name, handler)
  {
    node.addEventListener(name, handler);
    function unhandler()
    {
      node.removeEventListener(name, handler);
    }
    this._unhandlers.push(unhandler);
    return unhandler;
  },

  removeListener: function(unhandle)
  {
    var unhandlers = this._unhandlers;
    var idx = unhandlers.indexOf(unhandle);
    if (idx !== -1)
    {
      unhandlers.splice(idx, 1);
    }
  },

  _removeAllUnhandlers: function()
  {
    this._unhandlers.forEach(function(unhandle)
    {
      unhandle();
    });
    delete this._unhandlers;
  }
}).statics(
{
  _nextId: 1,

  buildIdentity: function(renderer, model)
  {
    return Identity(renderer, function()
    {
      return "v" + View._nextId++;
    }) + "-" + Model.identity(model);
  }
});
var ViewSet = exports.ViewSet = Class(View,
{
  constructor: function(__super, args)
  {
    var self = this;
    if (!args.className)
    {
      args.className = "collection-view";
    }
    self.limit = args.limit;
    __super(args);
    if (self.$model.addEventListener)
    {
      self.addListener(self.$model, "insert", function(evt, args)
      {
        self.$insertHandler(evt, args);
      });
      self.addListener(self.$model, "truncate", function(evt, args)
      {
        self.$truncateHandler(evt, args);
      });
      self.addListener(self.$model, "remove", function(evt, args)
      {
        self.$removeHandler(evt, args);
      });
    }
  },

  $insertHandler: function(evt, args)
  {
    var node = this.node();
    if (args.count === 1 & node)
    {
      var stage = this.stage();
      stage.innerHTML = this.$renderer(this.$model.models[args.index]);
      var children = node.children;
      var child = children.item(args.index);
      if (child)
      {
        node.insertBefore(stage.firstElementChild, child);
      }
      else
      {
        node.appendChild(stage.firstElementChild);
      }
      if (this.limit !== undefined)
      {
        while (children.length > this.limit)
        {
          node.removeChild(node.lastChild);
        }
      }
    }
    else
    {
      this.$updateHandler();
    }
  },

  $removeHandler: function(evt, args)
  {
    var node = this.node();
    var index = args.index;
    if (index !== undefined)
    {
      var children = node.children;
      for (; args.count > 0 && index < children.length; args.count--)
      {
        node.removeChild(children.item(index));
      }
      if (args.count > 0)
      {
        this.$updateHandler();
      }
    }
    else
    {
      this.$updateHandler();
    }
  },

  $truncateHandler: function(evt, args)
  {
    var count = args.count;
    var node = this.node();
    if (node)
    {
      for (var child = node.lastChild; count > 0 & child; count--, child = node.lastChild)
      {
        node.removeChild(child);
      }
    }
    else
    {
      this.$updateHandler();
    }
  },

  innerHtml: function()
  {
    var models = this.$model.models;
    var len = models.length;
    if (this.limit !== undefined)
    {
      len = Math.min(this.limit, len);
    }
    var s = "";
    var fn = this.$renderer;
    for (var i = 0; i < len; i++)
    {
      s += this.$cursor.using(models[i], fn, i);
    }
    return s;
  }
}).statics(
{
  create: function(methods)
  {
    return Class(ViewSet, methods);
  }
});
var Template = exports.Template = Class(
{
  _pattern: /({{#|{{\^|{{\/|{{{|{{!|{{=|{{>|{{:|{{|}}}|}})/,

  constructor: function(str, partials, p)
  {
    var parts = str.split(this._pattern);
    var fn = 'o=o.__proto__===Template.Cursor.prototype?o:new Template.Cursor([o]);return"' + this._esc(parts[0]);
    var instr = 1;
    var fnnr = 1;
    var fnstack = [];
    var t = this;
    p = p || {};
    for (var i = 1, len = parts.length; i < len; i += 2)
    {
      var key = parts[i+1];
      switch (parts[i])
      {
        // Include the following if true
        case '{{#':
          var fnkey = "_f" + fnnr++;
          fn += (instr ? '"' : '') + '+t.s(o,"' + this._esc(key) + '",t.' + fnkey + ')';
          fnstack.unshift(fn);
          fn = 'this.' + fnkey + '=function(o){return"';
          instr = 1;
          break;
          
        // Include the following if false
        case '{{^':
          var fnkey = "_f" + fnnr++;
          fn += (instr ? '"' : '') + '+t.ns(o,"' + this._esc(key) + '",t.' + fnkey + ')';
          fnstack.unshift(fn);
          fn = 'this.' + fnkey + '=function(o){return"';
          instr = 1;
          break;
          
        // End of optional include
        case '{{/':
          if (!fnstack.length)
          {
            throw new Error("Mismatched {{/" + key);
          }
          if (fn[0] === ':')
          {
            fn = fn.slice(1) + ';}';
          }
          else
          {
            fn += (instr ? '"' : '') + ';}';
          }
          eval(fn);
          fn = fnstack.shift();
          instr = 0;
          break;
        
        // Partial
        case '{{>':
          var ptmpl = partials[key];
          if (ptmpl)
          {
            fn += (instr ? '"' : '') + '+p.' + key + '.r(o)';
            instr = 0;
            if (!p[key])
            {
              p[key] = true; // Avoid recursion
              p[key] = new this.__proto__.constructor(ptmpl, partials, p);
            }
          }
          else
          {
            throw new Error("Missing partial: " + key);
          }
          break;
          
        // Define a view function.  These are accessed by {{properties}}
        case '{{:':
          fn += (instr ? '"' : '');
          instr = 1;
          fnstack.unshift(fn);
          fn = ':this.' + key + '=function(){';
          break;
          
        // Substitution
        case '{{':
        case '{{{':
          fn += (instr ? '"' : '') + (parts[i] === '{{' ? '+t.e(o,"' + key + '")' : '+t.v(o,"' + key + '")');
          instr = 0;
          break;
          
        // Ignore comments
        case '{{!':
          break;
          
        // Delimiters - not supported because we dont use it
        case '{{=':
          throw new Error('Not supported: {{=');

        // End of command
        case '}}}':
        case '}}':
          if (key)
          {
            fn += (instr ? '' : '+"') + this._esc(key);
            instr = 1;
          }
          break;

        default:
          throw new Error("Bad token: " + parts[i]);
      }
    }
    fn += instr ? '"' : '';
    //console.log('this.r', " = ", fn);
    eval('this.r=function(o){' + fn + '}');
  },

  /**
   * Value
   */
  v: function(o, k)
  {
    if (k in this)
    {
      return this[k].call(o);
    }
    else
    {
      return o.v(k);
    }
  },
  
  _esc: function(s)
  {
    return s.replace(/"/g, '\\"');
  },

  /**
   * Section
   */
  s: function(o, k, fn)
  {
    var v = this.v(o, k);
    if (v)
    {
      switch(Object.prototype.toString.call(v))
      {
        case "[object Object]":
          return o.using(v, fn);
        case "[object Array]":
          var s = "";
          v.forEach(function(e, i)
          {
            s += o.using(e, fn, i);
          });
          return s;
        default:
          return fn(o);
      }
    }
    else
    {
      return "";
    }
  },

  /**
   * Not-section
   */
  ns: function(o, k, fn)
  {
    return this.v(o, k) ? "" : fn(o);
  },

  /**
   * Escape
   */
  e: function(o, k)
  {
    var str = this.v(o, k);
    switch (typeof str)
    {
      case "number":
      case "boolean":
        return str;
        
      case "undefined":
        return null;

      default:
        if (str === null)
        {
          return null;
        }
        else
        {
          return str.replace(/&(?!\w+;)|["'<>\\]/g, function(s)
          {
            switch(s)
            {
              case "&": return "&amp;";
              case '"': return '&quot;';
              case "'": return '&#39;';
              case "<": return "&lt;";
              case ">": return "&gt;";
              default: return s;
            }
          });
        }
    }
  }
}).statics(
{
  Cursor: Class(
  {
    constructor: function(o)
    {
      this.o = o;
    },

    clone: function(o)
    {
      return new Template.Cursor((o || []).concat(this.o));
    },

    equalEnd: function(other)
    {
      if (this !== other)
      {
        var o = this.o;
        var oo = other.o;
        var len = oo.length;
        var offset = o.length - oo.length
        if (offset < 0)
        {
          return false;
        }
        for (var i = 0; i < len; i++)
        {
          if (o[i + offset] !== oo[i])
          {
            return false;
          }
        }
      }
      return true;
    },

    v: function(key)
    {
      for (var i = 0, len = this.o.length; i < len; i++)
      {
        var o = this.o[i];
        if (key in o)
        {
          var v = o[key];
          if (typeof v === "function")
          {
            v = v.call(o);
          }
          return v;
        }
      }
      var top = this.o[0];
      return top.__missing && top.__missing(key);
    },

    using: function(no, fn, extra)
    {
      if (arguments.length === 3)
      {
        this.o.unshift([extra]);
      }
      this.o.unshift(no);
      try
      {
        return fn.call(null, this, extra);
      }
      finally
      {
        this.o.shift();
        if (arguments.length === 3)
        {
          this.o.shift();
        }
      }
    },

    push: function(o)
    {
      this.o = this.o.concat(o);
    }
  })
});
var InputViewMixin =
{
  constructor: function(__super, args)
  {
    __super(args);
    this.$controllers = this.$controllers || [];
    this.$controllers.push(
    {
      onInput: function(m, v, e)
      {
        m[e.target.name](e.target.value);
      },

      onChange: function(m, v, e)
      {
        m[e.target.name](e.target.value);
      }
    });
  },

  input_attributes: function()
  {
    return 'data-action-input="Input"';
  },

  change_attributes: function()
  {
    return 'data-action-change="Change"';
  },

  select_attributes: function()
  {
    return 'data-action-change="Change"';
  }
};
var _dragging = null;
var DragViewMixin =
{
  constructor: function(__super, args)
  {
    this.$controllers = this.$controllers || [];
    this.$controllers.push(
    {
      onDragStart: function(m, v, e)
      {
        _dragging = m;
        v.property("dragging", "dragging");
        return false;
      },

      onDragEnd: function(m, v, e)
      {
        _dragging = null;
        v.property("dragging", "");
        return false;
      }
    });

    __super(args);
  },

  drag_attributes: function()
  {
    return 'data-action-dragstart="DragStart" data-action-dragend="DragEnd"';
  },

  dragged: function()
  {
    return _dragging;
  }
};
var DropViewMixin =
{
  constructor: function(__super, args)
  {
    this.$controllers = this.$controllers || [];
    this.$controllers.push(
    {
      onDragEnter: function(m, v, e)
      {
        v.property("dropzone", "dropzone");
        return false;
      },

      onDragLeave: function(m, v, e)
      {
        v.property("dropzone", "");
        return false;
      }
    });

    __super(args);
  },

  drop_attributes: function()
  {
    return 'ondragover="return false;" data-action-dragenter="DragEnter" data-action-dragleave="DragLeave"';
  },

  dropped: function()
  {
    return _dragging;
  }
};
var LiveListViewMixin =
{
  constructor: function(__super, args)
  {
    var self = this;
    self._liveList =
    {
      _count: 0,
      _running: false,
      _page: args.pageSize || 20,
      _length: 0
    };
    __super(args);
    RenderQ.addFn(function()
    {
      self._watchScroller();
    });
  },

  $insertHandler: function(__super, evt, args)
  {
    if (RenderQ.onQ(this))
    {
      // If on RenderQ already, no point (and possible wrong) doing anything here.
    }
    else
    {
      var node = this.node();
      if (node)
      {
        if (args.count && args.index === 0)
        {
          var container = this._scrollContainer();

          if (!node.childElementCount)
          {
            var count = Math.min(this._liveList._count + args.count, this._liveList._page);
            this._prependModels(node, count);
          }
          else if (container.scrollTop > 0)
          {
            // Inserting 'above the fold' where we can't see.  We will scroll these in when we get
            // back to the top (if we do anything now the screen will flicker).
            this._liveList._count += args.count
          }
          else
          {
            this._scrollIn(args.count);
          }
        }
        else if (args.index > node.childElementCount)
        {
          // Inserting beyond what we can see - so nothing to do for the moment.
        }
        else
        {
          RenderQ.add(this);
        }
      }
      else
      {
        RenderQ.add(this);
      }
    }
  },

  $removeHandler: function(__super, evt, args)
  {
   if (RenderQ.onQ(this))
    {
      // If on RenderQ already, no point (and possible wrong) doing anything here.
    }
    else if (args.index !== undefined)
    {
      if (args.index < this._liveList._count)
      {
        var diff = Math.min(args.count, this._liveList._count - args.index);
        this._liveList._count -= diff;
        args.count -= diff;
      }
      args.index -= this._liveList._count;
      __super(evt, args);
    }
    else
    {
      __super(evt, args);
    }
  },

  html: function()
  {
    return '<div ' + this.htmlOptions() + '>' +
      '<div class="xo-scrollable">' + this.innerHtml() + '</div>' +
    '</div>';
  },

  innerHtml: function()
  {
    var models = this.$model.models;
    var len = Math.min(models.length, this._liveList._page);
    if (this.limit !== undefined)
    {
      len = Math.min(this.limit, len);
    }
    var s = "";
    var fn = this.$renderer;
    for (var i = 0; i < len; i++)
    {
      s += this.$cursor.using(models[i], fn, i);
    }
    this._liveList._length = len;
    this._liveList._count = 0;
    return s;
  },

  node: function(__super)
  {
    var node = __super();
    return node ? node.firstChild : null;
  },

  _scrollContainer: function()
  {
    return this.node().parentNode;
  },

  _scrollIn: function(count)
  {
    this._liveList._count += count;
    if (!this._liveList._running && this._liveList._count > 0)
    {
      this._liveList._running = true;

      var container = this._scrollContainer();
      var node;
      var diff;
      var staging;
      return Co.Forever(this,
        function()
        {
          node = this.node();
          staging = document.createElement("div");
          staging.className = "xo-scrollable";
          staging.style.position = "absolute";
          staging.style.top = 0;
          container.insertBefore(staging, node);

          count = Math.min(this._liveList._count, this._liveList._page);
          this._liveList._count = 0;
          this.action("scroll-insert-above", { count: count });
          diff = this._prependModels(staging, count);
          var rest = Math.min(this.$model.models.length, this._liveList._page);
          this._appendModels(staging, count, rest);
          this._liveList._length = rest;
          node.style.WebkitTransition = "-webkit-transform " + Math.min(count * 0.25, 1) + "s ease";
          node.style.WebkitTransform = "translate3d(0,0,0)";
          Co.Sleep(0.5);
        },
        function()
        {
          node.style.WebkitTransform = "translate3d(0," + diff + "px,0)";
          Co.Sleep(Math.min(count * 0.25, 1));
        },
        function()
        {
          container.removeChild(node); // staging is the new 'node'
          staging.style.position = null;
          Co.Sleep(Math.min(count, 15) - Math.min(count * 0.25, 1));
        },
        function()
        {
          if (this._liveList._count === 0 || container.scrollTop > 0)
          {
            this._liveList._running = false;
            return Co.Break();
          }
          return true;
        }
      );
    }
  },

  _prependModels: function(node, count)
  {
    var models = this.$model.models;
    var html = "";
    var fn = this.$renderer;
    for (var idx = 0; idx < count && models[idx]; idx++)
    {
      html += this.$cursor.using(models[idx], fn, idx);
    }

    var sHeight = node.scrollHeight;
    node.insertAdjacentHTML("afterbegin", html);
    return node.scrollHeight - sHeight;
  },

  _appendModels: function(node, offset, limit)
  {
    var models = this.$model.models;
    var html = "";
    var fn = this.$renderer;
    for (var idx = offset; idx < limit && models[idx]; idx++)
    {
      html += this.$cursor.using(models[idx], fn, idx);
    }

    var sHeight = node.scrollHeight;
    node.insertAdjacentHTML("beforeend", html);
    return node.scrollHeight - sHeight;
  },

  scrollToTop: function(now, duration)
  {
    var node = this._scrollContainer();
    var start = node.scrollTop;
    duration = 1000 * (duration || Math.min(Math.max(start / 500, 0.2), 1));
    if (now || !duration)
    {
      this.action("scroll-to-top", { animated: false });
      node.scrollTop = 0;
      return true;
    }
    else
    {
      this.action("scroll-to-top", { animated: true });
      var startTime = Date.now();
      return Co.Forever(this,
        function()
        {
          var time = Date.now() - startTime;
          node.scrollTop = start * 0.5 * (1 + Math.cos(time / duration * Math.PI));
          if (time >= duration)
          {
            node.scrollTop = 0;
            return Co.Break();
          }
          else
          {
            return Co.Yield();
          }
        }
      );
    }
  },

  _watchScroller: function()
  {
    var self = this;
    var container = self._scrollContainer();
    this.addListener(container, "scroll", function()
    {
      var node = self.node();
      if (container.scrollTop === 0)
      {
        self._scrollIn(0);
      }
      else if (container.scrollTop + container.offsetHeight * 2 > container.scrollHeight)
      {
        var offset = self._liveList._length + self._liveList._count;
        var limit = offset + self._liveList._page;
        var len = self.$model.models.length;
        if (limit > len)
        {
          limit = len;
        }
        if (offset < limit)
        {
          self._appendModels(node, offset, limit);
          var count = limit - offset;
          self._liveList._length += count;
          self.action("scroll-insert-below", { count: count });
        }
      }
    });
  }
};
var StackedViewSetMixin =
{
  constructor: function(__super, args)
  {
    var self = this;
    self._flatModels = args.model;
    self._stackKey = args.stackKey;
    self._stacks = {};
    args.model = new IndexedModelSet(
    {
      key: args.key
    });
    self._filter(self._flatModels, args.model);
    __super(args);
    self.addListener(self._flatModels, "insert remove truncate", function(evt)
    {
      self._filter(self._flatModels, self.$model);
    });
  },

  identity: function()
  {
    return xo.View.buildIdentity(this.$renderer, this._flatModels);
  },

  _filter: function(from, to)
  {
    var key = this._stackKey;
    var idx = 0;
    var state = {};
    from.forEach(function(model)
    {
      var id = model[key]();
      var cmodel = to.findByProperty(key, id);
      if (!cmodel)
      {
        to.insertAt(idx++, model);
        state[id] = { first: model, idx: 0 };
      }
      else if (model !== cmodel)
      {
        var children = this._stacks[id]
        if (!children)
        {
          children = new ModelSet();
          this._stacks[id] = children;
          cmodel.has_children = true;
          cmodel.children = children;
        }
        if (children.indexOf(model) === -1)
        {
          var cs = state[id];
          if (!cs)
          {
            cs = state[id] = { first: model, idx: 0 };
          }
          if (cs.first !== cmodel)
          {
            var cidx = to.indexOf(cmodel);
            to.remove(cmodel);
            to.insertAt(cidx++, model);

            delete cmodel.has_children;
            delete cmodel.children;
            cmodel.emit("update");

            model.has_children = true;
            model.children = children;
            model.emit("update");

            cs.idx = 0;
            model = cmodel;
          }
          children.insertAt(cs.idx++, model);
        }
      }
    }, this);
  }
};
var TextFilterViewMixin =
{
  constructor: function(__super, args)
  {
    var self = this;
    self._srcModels = args.model;
    self._tgtModels = new args.model.__proto__.constructor(args.model._values);
    self._filterText = "";
    self._keys = args.filterKeys;
    self._lookups = {};
    args.model = self._tgtModels;
    self._textFilter(self._srcModels.models);
    __super(args);
    self.addListener(self._srcModels, "insert", function(evt, info)
    {
      self._textFilter(info.index === 0 ? info.models : this._srcModels.models);
    });
    self.addListener(self._srcModels, "remove truncate", function(evt, info)
    {
      var lookups = self._lookups;
      info.models.forEach(function(model)
      {
        delete lookups[Model.identity(model)];
      });
      if (evt === "remove")
      {
        self._tgtModels.remove(info.models);
      }
    });
  },

  identity: function()
  {
    return xo.View.buildIdentity(this.$renderer, this._srcModels);
  },

  filterText: function(text)
  {
    if (text !== this._filterText)
    {
      this._filterText = text;
      this._textFilter(this._srcModels.models);
    }
  },

  _textFilter: function(models)
  {
    var keys = this._keys;
    var lookups = this._lookups;
    var filter = this._filterText;

    var include;
    if (!filter)
    {
      include = models;
    }
    else
    {
      include = [];
      models.forEach(function(model)
      {
        var id = Model.identity(model);
        var lookup = lookups[id];
        if (!lookup)
        {
          var text = "";
          keys.forEach(function(key)
          {
            text += " " + model[key]();
          });
          lookup = lookups[id] = text.toLowerCase();
        }
        if (lookup.indexOf(filter) != -1)
        {
          include.push(model);
        }
      });
    }
    if (models === this._srcModels.models)
    {
      this._tgtModels.removeAll();
    }
    if (include.length)
    {
      this._tgtModels.prepend(include);
    }
  }
};
var RootView = exports.RootView = Class(View,
{
  constructor: function(__super, args)
  {
    var self = this;
    self.$controllers = args.controllers ? args.controllers : args.controller ? [ args.controller ] : [];
    self.$template = args.template && this.ViewTemplate.get(args.template, args.partials);
    args.renderer = args.renderer || function(model)
    {
      return self.$template.r(model);
    };
    __super(args);

    RootView._addHandlers();

    args.node.__rootview = self;

    RenderQ.ids[View.buildIdentity(self.$renderer, self.$model)] = self;

    this.addListener(document, "orientationchange", function()
    {
      self.action("orientationchange", { target: self.node().firstChild, orientation: window.orientation });
    });

    if (!args.noOpen)
    {
      args.node.innerHTML = self.html();
    }
  },

  destructor: function(__super)
  {
    delete RenderQ.ids[View.buildIdentity(this.$renderer, this.$model)];
    var node = this.node(); // Might have stuff in the tree even if $node is not yet defined
    if (node)
    {
      node.parentNode.removeChild(this.$node);
    }
    __super();
  },

  addController: function(controller)
  {
    if (this.$controllers.indexOf(controller) === -1)
    {
      this.$controllers.push(controller);
    }
  },

  ViewTemplate: Class(Template,
  {
    /**
     * Section
     */
    s: function(o, k, fn)
    {
      var m = this.v(o, k);
      if (m !== undefined)
      {
        if (m)
        {
          switch(Object.prototype.toString.call(m))
          {
            case "[object Object]":
            case "[object Array]":
              if (m.forEach)
              {
                var s = "";
                m.forEach(function(e, i)
                {
                  s += o.using(e, fn, i);
                }, this);
                return s;
              }
              else
              {
                return o.using(m, fn);
              }
            default:
              return fn(o);
          }
        }
        else
        {
          return "";
        }
      }
      else
      {
        k = k.split(" "); // 0:key 1:view 2...N:args
        var m;
        var c;
        if (k[0] === "_")
        {
          m = o.o[0];
          c = o;
        }
        else
        {
          m = this.v(o, k[0]);
          c = o;
        }
        if (m)
        {
          var v = RenderQ.getView(fn, m, function()
          {
            var aView = RootView._getViewClass(k[1]);
            var args =
            {
              model: m,
              cursor: c ? c : null,
              renderer: fn
            };
            for (var i = k.length - 1; i >= 2; i--)
            {
              var p = k[i].split(":");
              if (p.length >= 2)
              {
                var pk = p.shift();
                var pv = p.join(":");
                if (pk === "view")
                {
                  args[pk] = RootView._getViewClass(pv);
                }
                else
                {
                  
                  try
                  {
                    args[pk] = eval(pv);
                  }
                  catch (_)
                  {
                    args[pk] = pv;
                  }
                }
              }
            }
            return new aView(args);
          });
          RenderQ.remove(v);
          // We attempt to optimize rendering by not re-rendering (and then merging) content
          // we know we already have.  This can be quite tricky since a view can move around
          // on the screen, or a model can be referenced by a different modelset, and so even if
          // they themselves haven't changed, we still may need to re-render the content so we
          // can insert it into the new DOM tree.  To do this correctly, we track the chain of
          // views and models to this point (inside the template cursor) and compare them when
          // optimizing.  Only if these are identical, the model hasn't been changed, and we
          // are doing a merge operation, can we optimize the paint. Otherwise, we do a full render.
          var mseq = m.sequence;
          var vseq = v.sequence;
          if (!v.$cursor.equalEnd(o))
          {
            v.$cursor = o.clone([ m, v ]);
          }
          else if (RenderQ._inMerge && v.msequence === mseq && v.vsequence === vseq && mseq !== undefined && vseq !== undefined)
          {
            // The model hasn't changed since the view rendered it, so we don't render
            // it again but use a NOCHANGE node to alert the merger
            //console.log("***NO CHANGE ***");
            return "<!--NOCHANGE-->";
          }
          v.msequence = mseq;
          v.vsequence = vseq;
          return v.html();
        }
        else
        {
          return "";
        }
      }
    }
  }).statics(
  {
    _cache: new LRU(128),

    get: function(template, partials)
    {
      return this._cache.get(Identity(template) + Identity(partials), function(id)
      {
        return new this(template, partials);
      }, this);
    }
  })
}).statics(
{
  views:
  {
    View: View,
    ViewSet: ViewSet
  },

  getViewByNode: function(node)
  {
    return RenderQ.ids[node.dataset.view];
  },

  getViewByName: function(name)
  {
    var node = document.querySelector('[data-name="' + name + '"]');
    if (node)
    {
      return RenderQ.ids[node.dataset.view];
    }
    else
    {
      return null;
    }
  },

  _getViewClass: function(name)
  {
    var aView = this.views[name];
    if (!aView)
    {
      var vname = name.split(".");
      aView = this.views[vname[0]];
      if (!aView)
      {
        throw new Error("No view found: " + vname[0]);
      }
      var mixins = [ aView ];
      for (var i = 1, len = vname.length; i < len; i++)
      {
        var aMix = this.mixins[vname[i]];
        if (!aMix)
        {
          throw new Error("No mixin found: " + vname[i]);
        }
        mixins.push(aMix);
      }
      aView = Class.apply(null, mixins);
      this.views[name] = aView;
    }
    return aView;
  },

  _addHandlers: function()
  {
    if (!this._eventHandler)
    {
      var eventHandler = this._eventHandler = function(evt)
      {
        try
        {
          Log.info("Event", evt.type);
          if (RootView._onEvent(evt))
          {
            evt.stopPropagation && evt.stopPropagation();
            return false;
          }
        }
        catch (e)
        {
          Log.exception("Event " + evt.type, e);
        }
        return true;
      };
      var target = document.body;
      target.addEventListener("click", eventHandler);
      target.addEventListener("keypress", eventHandler);
      target.addEventListener("dragstart", eventHandler);
      target.addEventListener("dragend", eventHandler);
      target.addEventListener("dragenter", eventHandler);
      target.addEventListener("dragleave", eventHandler);
      target.addEventListener("drop", eventHandler);
      target.addEventListener("change", eventHandler);
      target.addEventListener("input", eventHandler);

      // Drag and drop emulation for touch devices
      if (Environment.isTouch())
      {
        var _maybeClick = null;
        var _maybeDrag = null;
        var _maybeSwipe = null;
        var _swipeStart = null;
        var _dragContainer = null;
        var _dragOffset = null;
        var _dropTargets = null;
        var _dropLastTarget = null;
        function doDrag(touch)
        {
          if (!_dragContainer)
          {
            _dragContainer = document.createElement("div");
            _dragContainer.className = "xo-drag-container";
            document.body.appendChild(_dragContainer);
          }
          if (!_dragContainer.firstChild)
          {
            var area = _maybeDrag.getClientRects()[0];
            _dragOffset = { left: area.left - touch.pageX, top: area.top - touch.pageY - (Environment.isTouch() ? 25 : 0) };
            _dragContainer.style.left = (_dragOffset.left + touch.pageX) + "px";
            _dragContainer.style.top = (_dragOffset.top + touch.pageY) + "px";
            _dragContainer.appendChild(_maybeDrag.cloneNode(true));
            eventHandler(
            {
              type: "dragstart",
              target: _maybeDrag
            });
          }
          else
          {
            _dragContainer.style.left = (_dragOffset.left + touch.pageX) + "px";
            _dragContainer.style.top = (_dragOffset.top + touch.pageY) + "px";
          }
        }
        target.addEventListener("touchstart", function(evt)
        {
          if (evt.targetTouches.length === 1)
          {
            var touch = evt.targetTouches[0];
            var target = touch.target;
            for (var dtarget = target; dtarget; dtarget = dtarget.parentElement)
            {
              if (getComputedStyle(dtarget, null).WebkitUserDrag === "element")
              {
                _maybeDrag = dtarget;
                _dropTargets = document.querySelectorAll("[ondragover]");
                _dropLastTarget = null;
                doDrag(touch);
                return;
              }
            }
            _maybeClick = target;
            _maybeSwipe = RootView._findSwipeTarget(target);
            _swipeStart = { x: touch.pageX, y: touch.pageY, hdir: null };
          }
        });
        target.addEventListener("touchend", function(evt)
        {
          if (evt.targetTouches.length === 0)
          {
            if (_maybeClick)
            {
              switch (_maybeClick.nodeName)
              {
                case "INPUT":
                case "TEXTAREA":
                  break;
                default:
                  var cevt = document.createEvent("MouseEvents");
                  cevt.initMouseEvent("click", true, true, window, -1, 0, 0, 0, 0, false, false, false, false, 0, null);
                  _maybeClick.dispatchEvent(cevt);
                  evt.preventDefault();
                  evt.stopPropagation();
                  break;
              }
            }
            else if (_maybeSwipe)
            {
              eventHandler(
              {
                type: _swipeStart.hdir === "l2r" ? "swipe-right" : "swipe-left",
                target: _maybeSwipe
              });
            }
          }
          _maybeClick = null;
          _maybeSwipe = null;
          if (_maybeDrag)
          {
            while (_dragContainer.firstChild)
            {
              _dragContainer.removeChild(_dragContainer.firstChild);
            }
            if (_dropLastTarget)
            {
              eventHandler(
              {
                type: "drop",
                target: _dropLastTarget
              });
            }
            eventHandler(
            {
              type: "dragend",
              target: _maybeDrag
            });
            _maybeDrag = null;
            _dropTargets = null;
            if (_dropLastTarget)
            {
              eventHandler(
              {
                type: "dragleave",
                target: _dropLastTarget
              });
              _dropLastTarget = null;
            }
          }
        });
        target.addEventListener("touchmove", function(evt)
        {
          if (evt.targetTouches.length === 1)
          {
            _maybeClick = null;
            if (_maybeDrag)
            {
              doDrag(evt.targetTouches[0]);
              var newTarget = RootView._findTargetMatch(_dragContainer, _dropTargets);
              if (newTarget != _dropLastTarget)
              {
                if (_dropLastTarget)
                {
                  eventHandler(
                  {
                    type: "dragleave",
                    target: _dropLastTarget
                  });
                }
                _dropLastTarget = newTarget;
                if (_dropLastTarget)
                {
                  eventHandler(
                  {
                    type: "dragenter",
                    target: _dropLastTarget
                  });
                }
              }
              evt.preventDefault();
            }
            else if (_maybeSwipe)
            {
              if (_maybeSwipe !== RootView._findSwipeTarget(evt.targetTouches[0].target))
              {
                _maybeSwipe = null;
              }
              else
              {
                _swipeStart.hdir = evt.pageX > _swipeStart.x ? "l2r" : "r2l";
              }
            }
          }
        });
      }
    }
  },

  _findTargetMatch: function(drag, dropTargets)
  {
    var left = drag.offsetLeft;
    var right = left + drag.offsetWidth;
    var top = drag.offsetTop;
    for (var i = dropTargets.length - 1; i >= 0; i--)
    {
      var dropTarget = dropTargets[i];
      var areas = dropTarget.getClientRects();
      for (var j = areas.length - 1; j >= 0; j--)
      {
        var area = areas[j];
        if (right > area.left && left < area.right && top > area.top && top < area.bottom)
        {
          return dropTarget;
        }
      }
    }
    return null;
  },

  _findSwipeTarget: function(target)
  {
    for (; target; target = target.parentElement)
    {
      if (target && target.dataset && (target.dataset.actionSwipeRight || target.dataset.actionSwipeLeft))
      {
        return target;
      }
    }
    return null;
  },

  _onEvent: function(evt)
  {
    var name = "data-action-" + evt.type;
    var ids = RenderQ.ids;
    var action = null;
    var stop = 0;
    var dispatched = 0;
    for (var target = evt.target; target && stop === 0; target = target.parentNode)
    {
      var view = null;
      if (target.getAttribute)
      {
        action = action || target.getAttribute(name);
        view = ids[target.getAttribute("data-view")];
      }
      if (action && view)
      {
        var cview = view;
        var ctarget = target;
        while (ctarget && stop === 0)
        {
          var controllers = cview.$controllers;
          if (controllers)
          {
            stop = 0;
            for (var i = 0, len = controllers.length; i < len; i++)
            {
              var controller = controllers[i];
              var fn = controller["on" + action];
              if (typeof fn === "function")
              {
                try
                {
                  if (fn.call(controller, view.$model, view, evt, cview.$model, cview) !== false)
                  {
                    stop++;
                  }
                  dispatched++;
                }
                catch (e)
                {
                  Log.exception(e);
                }
              }
            }
          }
          cview = null;
          for (ctarget = ctarget.parentNode; !cview && ctarget && stop === 0; ctarget = ctarget.parentNode)
          {
            if (ctarget.getAttribute)
            {
              cview = ids[ctarget.getAttribute("data-view")];
            }
          }
        }
      }
    }

    Log.action(evt.type, action, evt);

    return dispatched > 0;
  },

  mixins:
  {
    Input: InputViewMixin,
    Drag: DragViewMixin,
    Drop: DropViewMixin,
    LiveList: LiveListViewMixin,
    StackedList: StackedViewSetMixin,
    TextFilter: TextFilterViewMixin
  }
});
var RenderQ = exports.RenderQ =
{
  ids: {},

  _q: [],
  _fq: [],
  _d: {},
  _count: 0,

  add: function(view)
  {
    var id = view.identity();
    var depth = view.$depth;
    var q = this._q[depth] || (this._q[depth] = {});
    if (!(id in q))
    {
      q[id] = view;
      this._runq();
    }
  },

  addFn: function(fn)
  {
    this._fq.push(fn);
    this._runq();
  },

  remove: function(view)
  {
    var q = this._q[view.$depth];
    var id = view.identity();
    if (q && id in q)
    {
      delete q[id];
      this._count--;
    }
  },

  onQ: function(view)
  {
    var q = this._q[view.$depth];
    if (q && view.identity() in q)
    {
      return true;
    }
    else
    {
      return false;
    }
  },

  getView: function(renderer, model, viewFn)
  {
    var id = View.buildIdentity(renderer, model);
    var view = this.ids[id];
    if (!view && viewFn)
    {
      view = viewFn(renderer, model);
      this.ids[id] = view;
    }
    return view;
  },

  maybeDestroyView: function(idOrNode)
  {
    var id;
    if (typeof idOrNode === "string")
    {
      id = idOrNode;
    }
    else
    {
      var ids = idOrNode.querySelectorAll("[data-view]");
      for (var i = 0, len = ids.length; i < len; i++)
      {
        id = ids[i].dataset.view;
        var view = this.ids[id];
        if (view)
        {
          this._d[id] = view;
          view.$node = null;
        }
      }
      id = idOrNode.dataset.view;
    }
    var view = this.ids[id];
    if (view)
    {
      this._d[id] = view;
      view.$node = null;
    }
  },

  _runq: function()
  {
    if (!this._count++)
    {
      Co.Routine(this,
        function()
        {
          return Co.Yield();
        },
        function()
        {
          Log.time("RenderQ.render");
          while (this._count != 0)
          {
            var qs = this._q;
            for (var i = 1, len = qs.length; i < len && this._count; i++)
            {
              var q = qs[i];
              for (var id in q)
              {
                this._count--;
                var view = q[id];
                delete q[id];
                this._render(view);
              }
            }
            // The 0-renders are at unknown depths, so we do them last
            var q = qs[0];
            for (var id in q)
            {
              this._count--;
              var view = q[id];
              delete q[id];
              this._render(view);
            }
            var q = this._fq;
            this._fq = [];
            this._count -= q.length;
            for (var i = 0, len = q.length; i < len; i++)
            {
              try
              {
                q[i]();
              }
              catch (e)
              {
                Log.exception("RenderQ", e);
              }
            }
          }
          Log.timeEnd("RenderQ.render");
          this._runGc();
        }
      );
    }
  },
  
  _runGc: function()
  {
    // Run the View-GC after we let any pending events happen (such as rendering).
    Co.Routine(this,
      function()
      {
        return Co.Yield();
      },
      function()
      {
        //Log.time("RenderQ.gc");
        // Destroy any views we have flagged as possibly dead (check if they're alive first)
        var d = this._d;
        this._d = {};
        for (var id in d)
        {
          if (!document.querySelector('[data-view="' + id + '"]'))
          {
            //console.log("Destroying view", id);
            try
            {
              d[id].destructor();
            }
            catch (e)
            {
              Log.exception("runGc", e);
            }
            delete this.ids[id];
          }
        }
        //Log.timeEnd("RenderQ.gc");
      }
    );
  },

  /**
   * Render is called to re-render the view, usually because of changes to the model, or to view properties.
   */
  _render: function(view)
  {
    try
    {
      var node = view.node();
      if (node)
      {
        if (!node.firstChild)
        {
          node.innerHTML = view.innerHtml();
        }
        else
        {
          this._inMerge = true;
          var stage = view.stage();
          stage.innerHTML = view.innerHtml();
          this._mergeChildren(node, stage);
          this._inMerge = false;
        }
      }
      else
      {
        // View is no longer in the tree - destroy it
        Log.warn("View was removed from the tree while rendering: " + view.identity());
        this.maybeDestroyView(view.identity());
      }
    }
    catch (e)
    {
      Log.exception("renderQ:_render", e);
    }
  },

  _mergeChildren: function(oDom, nDom)
  {
    var oChild = oDom.firstChild;
    var nChild = nDom.firstChild;
    while (oChild && nChild)
    {
      var oSibling = oChild.nextSibling;
      var nSibling = nChild.nextSibling;

      var oName = oChild.nodeName;
      var nName = nChild.nodeName;
      if (oName === nName)
      {
        // Attempt to merge the child nodes
        if (!this._mergeSimilarNodes(nName, oChild, nChild))
        {
          // If this fails, we replace the old node with the new one
          oDom.replaceChild(nChild, oChild);
        }
      }
      else if (nName === "#text" && !/\S/.test(nChild.nodeValue))
      {
        // Empty text node, just ignore it
        oSibling = oChild;
      }
      else if (oName === "#text" && !/\S/.test(oChild.nodeValue))
      {
        // Empty text node, just ignore it
        nSibling = nChild;
      }
      else if (nName === "#comment" && nChild.nodeValue === "NOCHANGE")
      {
        // Keep old node
      }
      else
      {
        // Replace the old node with the new one
        oDom.replaceChild(nChild, oChild);
      }

      oChild = oSibling;
      nChild = nSibling;
    }

    if (!oChild && nChild)
    {
      // Still have new content?  Append it
      do
      {
        var nSibling = nChild.nextSibling;
        oDom.appendChild(nChild);
        nChild = nSibling;
      } while (nChild);
    }
    else if (oChild && !nChild)
    {
      // Still have old content, but no new content?  Truncate
      do
      {
        var oSibling = oChild.nextSibling;
        if (oChild.dataset && oChild.dataset.view)
        {
          RenderQ.maybeDestroyView(oChild);
        }
        oDom.removeChild(oChild);
        oChild = oSibling;
      } while (oChild);
    }
  },

  _mergeSimilarNodes: function(type, oDom, nDom)
  {
    switch (type)
    {
      case "#text":
        var nValue = nDom.nodeValue;
        if (oDom.nodeValue !== nValue)
        {
          oDom.nodeValue = nValue;
        }
        return true;

      case "IMG":
        this._mergeProperties(oDom, nDom, this._mergeImgProperties);
        return true;

      case "INPUT":
      case "TEXTAREA":
        this._mergeProperties(oDom, nDom, this._mergeInputProperties);
        return true;

      case "SPAN":
      case "SELECT":
      case "OPTION":
        this._mergeProperties(oDom, nDom);
        this._mergeChildren(oDom, nDom);
        return true;

      case "DIV":
        if (this._mergeProperties(oDom, nDom, this._mergeDivProperties))
        {
          // We dont merge children into editable divs (we keep the edited content)
          switch (oDom.contentEditable)
          {
            default:
              this._mergeChildren(oDom, nDom);
              break;
            case "true":
            case "":
              break;
          }
          return true;
        }
        else
        {
          return false;
        }

      case "A":
        this._mergeProperties(oDom, nDom, this._mergeAProperties);
        this._mergeChildren(oDom, nDom);
        return true;

      case "IFRAME":
        this._mergeProperties(oDom, nDom, this._mergeIFrameProperties);
        return true;

      default:
        return false; // Cannot merge
    }
  },

  _mergeCommonProperties:
  {
    className: true,
    id: true,
    tabIndex: true,
    title: true
  },

  _mergeDivProperties:
  {
    contentEditable: true
  },
  
  _mergeImgProperties:
  {
    src: true,
    alt: true
  },

  _mergeInputProperties:
  {
    accept: true,
    checked: true,
    maxLength: true,
    name: true,
    readOnly: true,
    size: true
  },

  _mergeAProperties:
  {
    href: true,
    name: true,
    rel: true,
    rev: true,
    target: true
  },

  _mergeIFrameProperties:
  {
    width: true,
    height: true,
    src: true,
    frameborder: true,
    allowfullscreen: true
  },

  _mergeProperties: function(oDom, nDom, extraProperties)
  {
    // data-* need special handling
    var v = nDom.dataset;
    var o = oDom.dataset;
    if (v && o && v.view !== o.view)
    {
      RenderQ.maybeDestroyView(oDom);
      return false;
    }
    for (var key in v)
    {
      if (o[key] !== v[key])
      {
        o[key] = v[key];
      }
    }
    var mergeCommonProperties = this._mergeCommonProperties;
    for (var key in mergeCommonProperties)
    {
      var v = nDom[key];
      if (oDom[key] !== v)
      {
        oDom[key] = v;
      }
    }
    // Style need special handling
    var v = nDom.style.cssText;
    var oStyle = oDom.style;
    if (v !== oStyle.cssText)
    {
      oStyle.cssText = v;
    }
    if (extraProperties)
    {
      for (var key in extraProperties)
      {
        var v = nDom[key];
        if (oDom[key] !== v)
        {
          oDom[key] = v;
        }
      }
    }
    return true;
  }
};
var ModalView = exports.ModalView = Class(RootView,
{
  _open: {},

  constructor: function(__super, args)
  {
    var self = this;
    if (self._open.modal)
    {
      self._open.modal.close();
    }
    self._open.modal = self;
    __super(args);
    this.$controllers.push(
    {
      onClose: function()
      {
        self.close();
      },
      onIgnore: function(m, v, e)
      {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    if (args.clickToClose !== false)
    {
      self.addListener(document, "click", function()
      {
        self.close();
      });
    }
  },

  destructor: function(__super)
  {
    this._open.modal = null;
    __super();
  },

  close: function()
  {
    this.action("close");
    this.destructor();
  }
});
var Controller = exports.Controller = Class(
{
  constructor: function()
  {
  },

  metrics:
  {
    category: "unknown"
  },

  metric: function(action, value)
  {
    Log.metric(this.metrics.category, action, value);
  }
}).statics(
{
  create: function(methods)
  {
    return Class(Controller, methods);
  }
});
var Url = exports.Url = Class(
{
  _split: /^(.*:)\/\/([^/]*)(?::(.*?))?(.*?)(\?.*?)?(#.*)?$/,

  constructor: function(str)
  {
    var split = this._split.exec(str);

    this.href = str;
    this.hash = split[6] || "";
    this.host = this.hostname = split[2];
    this.pathname = split[4] || "/"
    this.port = split[3] || "";
    this.protocol = split[1] || "http:";
    this.search = split[5] || "";
    this.origin = this.protocol + "//" + this.hostname + (this.port ? ":" + this.port : "");
  },

  getParameter: function(name)
  {
    if (!this._params)
    {
      this._params = {};
      this.search.substr(1).split("&").forEach(function(p)
      {
        p = p.split("=");
        this._params[p[0]] = p[1] || "";
      }, this);
    }
    return this._params[name] || "";
  }
});
if (typeof XMLHttpRequest !== "undefined")
{
  // Browser implementation
  exports.Ajax =
  {
    _Reply: Class(
    {
      constructor: function(status, text)
      {
        this._status = status;
        this._text = text;
      },

      status: function()
      {
        return this._status;
      },

      text: function()
      {
        return this._text;
      },

      json: function()
      {
        if (!this._json)
        {
          this._json = JSON.parse(this._text);
        }
        return this._json;
      },

      form: function()
      {
        if (!this._form)
        {
          var form = this._form = {};
          this._text.split("&").forEach(function(a)
          {
            a = a.split("=");
            form[unescape(a[0])] = unescape(a[1]);
          });
        }
        return this._form;
      },

      toString: function()
      {
        if (this._status === 200)
        {
          return this._text;
        }
        else
        {
          return "status: " + this._status;
        }
      }
    }),

    create: function(config)
    {
      return Co.Routine(this,
        function()
        {
          if (!config.headers)
          {
            config.headers = {};
          }
          if (!config.headers["Content-Type"])
          {
            config.headers["Content-Type"] = "application/x-www-form-urlencoded";
          }

          config.auth && config.auth.sign(config);

          var req = this._req = new XMLHttpRequest();
          var url;
          if (config.proxy)
          {
            url = config.proxy + escape(config.url);
          }
          else
          {
            url = config.url;
          }
          req.open(config.method, url, true);

          // Define any headers
          for (var key in config.headers)
          {
            req.setRequestHeader(key, config.headers[key]);
          }

          var sofar = 0;
          req.onreadystatechange = Co.Callback(this, function()
          {
            switch (req.readyState)
            {
              case 4: // DONE
                // And we're done
                var reply = new this._Reply(req.status, req.responseText);
                if (req.status != 200)
                {
                  throw reply;
                }
                else
                {
                  return reply;
                }
                break;

              default:
                break;
            }
          });

          var data = config.data;
          if (config.json)
          {
            data = JSON.stringify(config.json);
          }

          // Initiate the request, together with any data we want to send (for a POST or PUT)
          req.send(data);
        }
      );
    }
  }
}
/**
 * 
 */
if (typeof XMLHttpRequest !== "undefined")
{
  // Browser implementation
  exports.AjaxStream =
  {
    create: function(config)
    {
      return Co.Routine(this,
        function()
        {
          config.auth && config.auth.sign(config);

          var req = this._req = new XMLHttpRequest();
          var url;
          if (config.proxy)
          {
            url = config.proxy + escape(config.url);
          }
          else
          {
            url = config.url;
          }
          req.open(config.method, url, true);
    
          // Define any headers
          for (var key in config.headers)
          {
            req.setRequestHeader(key, config.headers[key]);
          }

          var sofar = 0;
          var abortReason = null;
          req.onreadystatechange = Co.Callback(this, function()
          {
            switch (req.readyState)
            {
              case 3: // LOADING
                // As the data comes in, we sent it on to any callback as we get new chunks
                var ntxt = req.responseText;
                var nlen = ntxt.length;
                if (nlen > sofar)
                {
                  config.onText && config.onText(ntxt.substr(sofar, nlen));
                  sofar = nlen;
                }
                break;

              case 4: // DONE
                // And we're done
                if (req.status != 200)
                {
                  throw { status: req.status, reason: abortReason };
                }
                else
                {
                  return { status: req.status, reason: abortReason };
                }
            }
          });

          config.abort = function(reason)
          {
            abortReason = reason;
            req.abort();
            config.onAbort && config.onAbort(abortReason);
          };

          if (config.onLine)
          {
            this.config.onText = this._makeTextToLine();
          }

          // Initiate the request, together with any data we want to send (for a POST or PUT)
          req.send(config.data);
        }
      );
    },

    _makeTextToLine: function()
    {
      var count = 0;
      var pending = [];
      var max = config.maxSize || 1024 * 1024;
      return function(text)
      {
        var self = this;
        count += chunk.length;
        if (count > max)
        {
          return self.abort("toolong");
        }
        var offset = 0;
        pending += chunk;
        var lines = pending.split("\r");

        for (var i = 0, len = lines.length - 1; i < len; i++)
        {
          var line = lines[i];
          offset += line.length + 1; // length + \r
          line = line.trim();
          if (line)
          {
            try
            {
              self.onLine(line);
            }
            catch (e)
            {
              Log.exception("Bad stream data", e);
            }
          }
        }

        pending = pending.substr(offset);
        if (timer)
        {
          clearTimeout(timer);
        }
        timer = setTimeout(function()
        {
          self.abort("timeout");
        }, self.timeout || 120000)
      }
    }
  };
}
else if (typeof require === "function")
{
  // NODE implementation
  exports.AjaxStream = Class(
  {
    constructor: function(config)
    {
      var url = /^(https?):\/\/([^:]*)(?::([0-9]+))?(\/.*)/.exec(config.url);
      var protocol;
      if (url[1] === "http" || url[1] === "https")
      {
        protocol = require(url[1]);
      }
      else
      {
        throw new Error("Not supported");
      }
      var headers = { "User-Agent": "node.js" };
      for (var key in config.headers)
      {
        headers[key] = config.headers[key];
      }
      if (config.data)
      {
        headers["Content-Length"] = config.data.length;
      }

      config.auth && config.auth.sign(config);

      var options =
      {
        method: config.method,
        host: url[2],
        port: parseInt(url[3] || 80),
        path: url[4],
        headers: headers
      };
      var req = this._req = protocol.request(options, function(res)
      {
        res.setEncoding('utf8');
        res.on("data", function(chunk)
        {
          config.ontext && config.onText(chunk);
        });
        res.on("end", function()
        {
          config.oncomplete && config.onComplete(res.statusCode);
        });
      });
      config.data && req.write(config.data, "utf8");
      req.end();
    },

    abort: function()
    {
      this._req.abort();
      this._config.onAbort && this._config.onAbort();
    }
  });
}
else
{
  throw new Error("Not supported");
}
var OAuth = exports.OAuth = Class(
{
  constructor: function(config)
  {
    this._config = config;
  },

  serialize: function()
  {
    var c = this._config;
    return {
      oauth_consumer_key: c.oauth_consumer_key,
      oauth_consumer_secret: c.oauth_consumer_secret,
      oauth_signature_method: c.oauth_signature_method,
      oauth_token: c.oauth_token,
      oauth_token_secret: c.oauth_token_secret
    };
  },

  sign: function(params)
  {
    var self = this;
    var config = self._config;

    // Setup basic header
    var nheaders =
    {
      oauth_timestamp: config.oauth_timestamp || Math.floor(Date.now() / 1000),
      oauth_nonce: config.oauth_nonce || "01234".replace(/./g, function() { return "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".charAt(Math.floor(Math.random() * 62)) }),
      oauth_consumer_key: config.oauth_consumer_key,
      oauth_signature_method: config.oauth_signature_method || "HMAC-SHA1",
      oauth_version: "1.0"
    };
    
    // Include options token and callback
    config.oauth_token && (nheaders.oauth_token = config.oauth_token);
    config.oauth_callback && (nheaders.oauth_callback = config.oauth_callback);
    
    // Encode any url parameters
    var surl = /^(.*)\?(.*)$/.exec(params.url) || [ null, params.url, null ];
    if (surl[2])
    {
      surl[2].split("&").forEach(function(kv)
      {
        kv = kv.split("=");
        if (kv.length == 2)
        {
          nheaders[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
        }
      });
    }

    // Encode any data paramters
    if (params.data && params.headers && params.headers["Content-Type"] === "application/x-www-form-urlencoded")
    {
      params.data.split("&").forEach(function(kv)
      {
        kv = kv.split("=");
        if (kv.length == 2)
        {
          nheaders[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
        }
      });
    }

    // Create signature from orders keys
    var sig = "";
    Object.keys(nheaders).sort().forEach(function(key)
    {
      sig += "&" + self._encode(key) + "=" + self._encode(nheaders[key])
    });
    sig = params.method + "&" + self._encode(surl[1]) + "&" + self._encode(sig.substring(1));
    
    // Sign
    switch (nheaders.oauth_signature_method)
    {
      case "HMAC-SHA1":
        nheaders.oauth_signature = self._b64HmacSha1(sig);
        break;
        
      case "PLAINTEXT":
        nheaders.oauth_signature = self._encode(config.oauth_consumer_secret) + "&" + self._encode(config.oauth_token_secret);
        break;
        
      default:
        throw new Error();
    }

    if (params.addToUrl)
    {
      // Add OAuth info as query parameters
      var oauth = "";
      for (var key in nheaders)
      {
        if (key.indexOf("oauth_") === 0)
        {
          oauth += key + "=" + self._encode(nheaders[key]) + "&";
        }
      }
      oauth = oauth.slice(0, -1);
      if (params.url.indexOf("?") === -1)
      {
        params.url += "?" + oauth;
      }
      else
      {
        params.url += "&" + oauth;
      }
    }
    else
    {
      // Create header
      var oauth = 'OAuth ' + (typeof config.realm === 'string' ? 'realm="' + config.realm + '", ' : '');
      Object.keys(nheaders).sort().forEach(function(key)
      {
        if (key.indexOf("oauth_") === 0)
        {
          oauth += key + "=\"" + self._encode(nheaders[key]) + "\",";
        }
      });
      // Add it
      (params.headers || (params.headers = {})).Authorization = oauth.slice(0, -1);
    }
  },

  _encode: function(str)
  {
    return !str ? "" : encodeURIComponent(str).replace(/[!*'()]/g, function(s)
    {
      switch(s)
      {
        case "!": return "%21";
        case '*': return "%2A";
        case "'": return "%27";
        case "(": return "%28";
        case ")": return "%29";
        default: return s;
      }
    });
  },

  _b64HmacSha1: function(d)
  {
    var _p;
    var _z;
    var k = this._encode(this._config.oauth_consumer_secret) + "&" + this._encode(this._config.oauth_token_secret);
    // heavily optimized and compressed version of http://pajhome.org.uk/crypt/md5/sha1.js
    // _p = b64pad, _z = character size; not used here but I left them available just in case
    if(!_p){_p='=';}if(!_z){_z=8;}function _f(t,b,c,d){if(t<20){return(b&c)|((~b)&d);}if(t<40){return b^c^d;}if(t<60){return(b&c)|(b&d)|(c&d);}return b^c^d;}function _k(t){return(t<20)?1518500249:(t<40)?1859775393:(t<60)?-1894007588:-899497514;}function _s(x,y){var l=(x&0xFFFF)+(y&0xFFFF),m=(x>>16)+(y>>16)+(l>>16);return(m<<16)|(l&0xFFFF);}function _r(n,c){return(n<<c)|(n>>>(32-c));}function _c(x,l){x[l>>5]|=0x80<<(24-l%32);x[((l+64>>9)<<4)+15]=l;var w=[80],a=1732584193,b=-271733879,c=-1732584194,d=271733878,e=-1009589776;for(var i=0;i<x.length;i+=16){var o=a,p=b,q=c,r=d,s=e;for(var j=0;j<80;j++){if(j<16){w[j]=x[i+j];}else{w[j]=_r(w[j-3]^w[j-8]^w[j-14]^w[j-16],1);}var t=_s(_s(_r(a,5),_f(j,b,c,d)),_s(_s(e,w[j]),_k(j)));e=d;d=c;c=_r(b,30);b=a;a=t;}a=_s(a,o);b=_s(b,p);c=_s(c,q);d=_s(d,r);e=_s(e,s);}return[a,b,c,d,e];}function _b(s){var b=[],m=(1<<_z)-1;for(var i=0;i<s.length*_z;i+=_z){b[i>>5]|=(s.charCodeAt(i/8)&m)<<(32-_z-i%32);}return b;}function _h(k,d){var b=_b(k);if(b.length>16){b=_c(b,k.length*_z);}var p=[16],o=[16];for(var i=0;i<16;i++){p[i]=b[i]^0x36363636;o[i]=b[i]^0x5C5C5C5C;}var h=_c(p.concat(_b(d)),512+d.length*_z);return _c(o.concat(h),512+160);}function _n(b){var t="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",s='';for(var i=0;i<b.length*4;i+=3){var r=(((b[i>>2]>>8*(3-i%4))&0xFF)<<16)|(((b[i+1>>2]>>8*(3-(i+1)%4))&0xFF)<<8)|((b[i+2>>2]>>8*(3-(i+2)%4))&0xFF);for(var j=0;j<4;j++){if(i*8+j*6>b.length*32){s+=_p;}else{s+=t.charAt((r>>6*(3-j))&0x3F);}}}return s;}function _x(k,d){return _n(_h(k,d));}return _x(k,d);
  }
});
var OAuthLogin = exports.OAuthLogin = Class(OAuth,
{
  constructor: function(__super, oauth)
  {
    __super(oauth);
    this._request = oauth.request;
    this._authorize = oauth.authorize;
    this._access = oauth.access;
    this._proxy = oauth.proxy;
  },

  login: function()
  {
    return Co.Routine(this,
      function()
      {
        this._config.oauth_callback = this._config.callback;
        return Ajax.create(
        {
          method: "GET" in this._request ? "GET" : "POST",
          url: this._request.GET || this._request.POST,
          auth: this,
          proxy: this._proxy
        });
      },
      function(r)
      {
        try
        {
          var args = r().form();
          this._config.oauth_token = args.oauth_token;
          this._config.oauth_token_secret = args.oauth_token_secret;

          var page =
          {
            method: "GET",
            url: this._authorize.GET,
            addToUrl: true
          };
          this.sign(page);
        }
        finally
        {
          delete this._config.oauth_callback;
        }

        var callbackOrigin = new Url(this._config.callback).origin;
        if (Environment.isPhoneGap())
        {
          var browser = ChildBrowser.install();
          browser.onLocationChange = Co.Callback(this, function(loc)
          {
            var url = new Url(loc);
            if (url.origin === callbackOrigin)
            {
              browser.close();
              return {
                oauth_token: url.getParameter("oauth_token"),
                oauth_verifier: url.getParameter("oauth_verifier")
              };
            }
          });
          browser.onClose = Co.Callback(this, function()
          {
            Log.info("User closed");
            throw new Error("User closed");
          });
          browser.showWebPage(page.url);
        }
        else if (window.open)
        {
          var win = window.open(page.url, "Login", "location=yes,resizable=yes,scrollbars=yes");
          if (!win)
          {
            throw new Error("Cannot open window for login");
          }
          return Co.Forever(this,
            function()
            {
              var origin = win && win.location && win.location.origin;
              if (origin === callbackOrigin)
              {
                var url = new Url(win.location.href);
                win.close();
                return Co.Break({
                  oauth_token: url.getParameter("oauth_token"),
                  oauth_verifier: url.getParameter("oauth_verifier")
                });
              }
              return Co.Sleep(0.1);
            }
          );
        }
        else
        {
          throw new Error("Cannot open window for login");
        }
      },
      function(args)
      {
        args = args();
        if (args.oauth_token === "denied")
        {
          throw new Error("Access denied");
        }
        this._config.oauth_token = args.oauth_token;
        return Ajax.create(
        {
          method: "GET" in this._access ? "GET" : "POST",
          url: this._access.GET || this._access.POST,
          auth: this,
          proxy: this._proxy,
          data: "oauth_verifier=" + args.oauth_verifier
        });
      },
      function(r)
      {
        var args = r().form();
        this._config.oauth_token = args.oauth_token;
        this._config.oauth_token_secret = args.oauth_token_secret;

        return args;
      }
    );
  }
});
var GridInstance = Class(
{
  constructor: function(grid, options)
  {
    this._grid = grid;
    this._options = options || {};
    if (this._options.lru)
    {
      var lru = new LRU(this._options.lru);
      lru.on("evict", function(event, path)
      {
        this.evict(path);
      }, this);
      this._options.touch = function(path)
      {
        lru.get(path, function()
        {
          return true;
        });
      }
    }
  },

  read: function(path)
  {
    return this._grid._read(this, path);
  },

  mread: function(paths)
  {
    return Co.Foreach(this, paths,
      function(path)
      {
        return this.read(path());
      }
    );
  },

  write: function(path, data)
  {
    return this._grid._write(this, path, data, this._options.touch);
  },

  mwrite: function(pathsAndData)
  {
    return Co.Foreach(this, pathsAndData,
      function(pathAndData)
      {
        pathAndData = pathAndData();
        return this.write(pathAndData[0], pathAndData[1]);
      }
    );
  },

  update: function(path, data)
  {
    return this._grid._update(this, path, data, this._options.touch);
  },

  mupdate: function(pathsAndData)
  {
    return Co.Foreach(this, pathsAndData,
      function(pathAndData)
      {
        pathAndData = pathAndData();
        return this.update(pathAndData[0], pathAndData[1]);
      }
    );
  },

  remove: function(path)
  {
    return this._grid._remove(this, path);
  },

  mremove: function(paths)
  {
    return Co.Foreach(this, paths,
      function(path)
      {
        return this.remove(path());
      }
    );
  },

  evict: function(path)
  {
    return this._grid._evict(this, path);
  },

  mevict: function(paths)
  {
    return Co.Foreach(this, paths,
      function(path)
      {
        return this.evict(path());
      }
    );
  },

  exception: function(obj, exception)
  {
    return this._grid._exception(this, obj, exception);
  },

  watch: function(selector, ctx, callback)
  {
    if (arguments.length === 2)
    {
      callback = ctx;
      ctx = null;
    }
    this._grid._watch(this, selector, ctx, callback);
  }
});

var Grid = exports.Grid = Class(
{
  constructor: function(config)
  {
    this._cache = new LRU(config.size);
    this._watchers = [];
  },

  get: function(options)
  {
    return new GridInstance(this, options);
  },

  _read: function(instance, path)
  {
    var obj = this._findInCache(path);
    if (obj.state === GridObject.PRESENT)
    {
      obj.touch && obj.touch(path);
      return obj.data;
    }
    else
    {
      return Co.Forever(this,
        function()
        {
          switch (obj.state)
          {
            case GridObject.EMPTY:
              this._addQ(obj);
              this._notify(instance, obj, Grid.READ);
              break;

            case GridObject.PRESENT:
            case GridObject.REMOVED:
              return Co.Break(obj.data);

            case GridObject.EXCEPTION:
              throw obj.exception;
              break;

            default:
              throw new Error("Grid._read: Bad state: " + obj.state);
          }
        }
      );
    }
  },

  _write: function(instance, path, data, touch)
  {
    var obj = this._findInCache(path);
    obj.data = data;
    obj.touch = touch;
    touch && touch(path);
    this._state(obj, GridObject.PRESENT);
    this._notify(instance, obj, Grid.WRITE);
    return data;
  },

  _update: function(instance, path, data, touch)
  {
    var obj = this._findInCache(path, true);
    if (!obj)
    {
      return null;
    }
    obj.data = data;
    obj.touch = touch;
    touch && touch(path);
    this._state(obj, GridObject.PRESENT);
    this._notify(instance, obj, Grid.UPDATE);
    return data;
  },

  _remove: function(instance, path)
  {
    var obj = this._removeFromCache(path);
    if (obj)
    {
      obj.data = null;
      this._state(obj, GridObject.REMOVED);
      this._notify(instance, obj, Grid.REMOVE);
    }
    return null;
  },

  _evict: function(instance, path)
  {
    var obj = this._removeFromCache(path);
    if (obj)
    {
      obj.data = null;
      this._state(obj, GridObject.REMOVED);
      this._notify(instance, obj, Grid.EVICT);
    }
    return null;
  },

  _exception: function(instance, path, exception)
  {
    var obj = this._findInCache(path, true);
    if (obj)
    {
      obj.exception = exception;
      this._state(obj, GridObject.EXCEPTION);
    }
    Log.exception("Grid.exception", exception);
  },

  _watch: function(instance, selector, ctx, callback)
  {
    this._watchers.push(
    {
      instance: instance,
      selector: selector,
      ctx: ctx,
      callback: callback
    });
  },

  _findInCache: function(path, nocreate)
  {
    return this._cache.get(path, nocreate ? null : function()
    {
      return new GridObject(path, null, GridObject.EMPTY);
    }, this);
  },

  _removeFromCache: function(path)
  {
    return this._cache.remove(path);
  },

  _state: function(obj, newstate)
  {
    if (obj.state !== newstate)
    {
      obj.state = newstate;
      this._wakeQ(obj);
    }
  },

  _notify: function(instance, obj, operation)
  {
    var valid = false;
    var path = obj.path;
    this._watchers.forEach(function(watch)
    {
      if (watch.instance !== instance)
      {
        if (watch.selector.test(path))
        {
          try
          {
            valid = true;
            watch.callback.call(watch.ctx, operation, path, obj.data);
          }
          catch (e)
          {
            this._exception(instance, path, e);
          }
        }
      }
      else
      {
        valid = true;
      }
    }, this);
    if (!valid)
    {
      throw new Error("No one on Grid for path: " + path);
    }
  },

  _addQ: function(obj)
  {
    if (!obj._queue)
    {
      obj._queue = [];
    }
    obj._queue.push(Co.Callback(this, function()
    {
      return true;
    }));
  },

  _wakeQ: function(obj)
  {
    var q = obj._queue;
    if (q)
    {
      delete obj._queue;
      q.forEach(function(fn)
      {
        fn();
      });
    }
  }
}).statics(
{
  READ: 1,
  WRITE: 2,
  UPDATE: 3,
  REMOVE: 4,
  EVICT: 5
});
var GridObject = exports.GridObject = Class(
{
  constructor: function(path, data, state)
  {
    this.path = path;
    this.data = data;
    this.state = state;
    this.touch = null;
    this.exception = null;
  }
}).statics(
{
  EMPTY: 1,
  PRESENT: 2,
  REMOVED: 3,
  EXCEPTION: 4
});
var GridProvider = exports.GridProvider = Class(
{
  constructor: function(grid, selector, options)
  {
    this.grid = grid;
    this.selector = selector;
    if (options)
    {
      if (options.lruSize)
      {
        this.lru = new LRU(options.lruSize);
        this.lru.on("evict", function(path)
        {
          grid.evict(path);
        }, this);
        var lru = this.lru;
        this.touch = function(obj)
        {
          self.lru.get(obj.path);
        }
      }
    }
  },

  path: function(path)
  {
    return this.selector.exec(path)[1] || "";
  },

  addToLru: function(obj)
  {
    obj.touch = this.touch;
    this.lru.add(obj.path, true);
  }
});
var AjaxGridProvider = exports.AjaxGridProvider = Class(GridProvider,
{
  constructor: function(__super, grid, selector, url, auth)
  {
    __super(grid, selector);

    grid.watch(selector, this, function(operation, obj)
    {
      var path = this.path(obj);
      switch (operation)
      {
        case Grid.READ:
          Co.Routine(this,
            function()
            {
              return Ajax.create(
              {
                method: "GET",
                auth: auth,
                url: url + "?path=" + escape(path)
              });
            },
            function(r)
            {
              try
              {
                grid.write(obj.path, r().json());
              }
              catch (e)
              {
                grid.exception(obj.path, e);
              }
            }
          );

        case Grid.WRITE:
          Co.Routine(this,
            function()
            {
              return Ajax.create(
              {
                method: "POST",
                auth: auth,
                url: url,
                data: "path=" + escape(path) + "&data=" + escape(JSON.stringify(obj.data))
              });
            },
            function(r)
            {
              try
              {
                r();
              }
              catch (e)
              {
                grid.exception(obj.path, e);
              }
            }
          );

        case Grid.REMOVE:
          Co.Routine(this,
            function()
            {
              return Ajax.create(
              {
                method: "DELETE",
                auth: auth,
                url: url + "?path=" + escape(path)
              });
            },
            function(r)
            {
              try
              {
                r();
              }
              catch (e)
              {
                grid.exception(obj.path, e);
              }
            }
          );

        default:
          break;
      }
    });
  }
});
var LocalStorageGridProvider = exports.LocalStorageGridProvider = Class(GridProvider,
{
  constructor: function(__super, grid, selector, transform, dbinfo)
  {
    __super(grid, selector);
    this._dbinfo = dbinfo;

    var root = dbinfo.name + ":" + dbinfo.table + ":";
    grid.watch(selector, this, function(operation, path, data)
    {
      var dpath = root + (transform ? transform(selector, path) : selector.exec(path)[1]);
      switch (operation)
      {
        case Grid.READ:
            try
            {
              if (dpath in localStorage)
              {
                grid.write(path, JSON.parse(localStorage[dpath]));
                break;
              }
            }
            catch (_)
            {
            }
            grid.write(path, null);
            break;

        case Grid.WRITE:
            localStorage[dpath] = JSON.stringify(data);
            break;

        case Grid.REMOVE:
            delete localStorage[dpath];
            break;

        default:
          break;
      }
    });
  }

});
var SQLStorageGridProvider = exports.SQLStorageGridProvider = Class(GridProvider,
{
  _dbs: {},

  constructor: function(__super, grid, selector, transform, dbinfo)
  {
    __super(grid, selector);
    this._dbinfo = dbinfo;

    grid.watch(selector, this, function(operation, path, data)
    {
      var dpath = transform ? transform(selector, path) : selector.exec(path)[1];
      switch (operation)
      {
        case Grid.READ:
          Co.Routine(this,
            function()
            {
              return this._openDB();
            },
            function(db)
            {
              Log.time("dbRead: " + dpath);
              return this._doTransaction(db(), 'SELECT * FROM ' + this._dbinfo.table + ' WHERE id=?', [ dpath ]);
            },
            function(r)
            {
              Log.timeEnd("dbRead: " + dpath);
              r = r();
              if (r.rows.length > 0)
              {
                grid.write(path, JSON.parse(r.rows.item(0).data));
              }
              else
              {
                grid.write(path, null);
              }
            }
          );
          break;

        case Grid.WRITE:
          Co.Routine(this,
            function()
            {
              return this._openDB();
            },
            function(db)
            {
              Log.time("dbWrite: " + dpath);
              return this._doTransaction(db(), 'INSERT OR REPLACE INTO ' + this._dbinfo.table + ' (id, data) VALUES (?,?)', [ dpath, JSON.stringify(data) ]);
            },
            function(r)
            {
              Log.timeEnd("dbWrite: " + dpath);
              try
              {
                r();
              }
              catch (e)
              {
                grid.exception(path, e);
              }
            }
          );
          break;

        case Grid.REMOVE:
          Co.Routine(this,
            function()
            {
              return this._openDB();
            },
            function(db)
            {
              Log.info("dbRemove", dpath);
              return this._doTransaction(db(), 'DELETE FROM ' + this._dbinfo.table + ' WHERE id=?', [ dpath ]);
            },
            function(r)
            {
              try
              {
                r();
              }
              catch (e)
              {
                grid.exception(path, e);
              }
            }
          );
          break;

        default:
          break;
      }
    });
  },

  _openDB: function()
  {
    var db = this._dbs[this._dbinfo.name];
    if (!db)
    {
      Log.info("dbOpen", this._dbinfo.name);
      return Co.Lock(this,
        function()
        {
          db = this._dbs[this._dbinfo.name];
          if (!db)
          {
            db = openDatabase(this._dbinfo.name, this._dbinfo.version || "1.0", this._dbinfo.description || this._dbinfo.name, this._dbinfo.size || 1024 * 1024);
            this._doTransaction(db, 'CREATE TABLE IF NOT EXISTS ' + this._dbinfo.table + ' (id unique, data)');
            this._dbs[this._dbinfo.name] = db;
          }
          return db;
        }
      );
    }
    else
    {
      return db;
    }
  },

  _doTransaction: function(db, cmd, args)
  {
    return Co.Routine(this,
      function()
      {
        db.transaction(Co.Callback(this, function(tx)
        {
          tx.executeSql(cmd, args,
            Co.Callback(this, function success(tx, results) { return results || null; }),
            Co.Callback(this, function error(tx, err) { throw err; })
          );
        }));
      }
    );
  }

});
})();
var KEYS =
{
  twitter:
  {
    oauth_consumer_key: "wFdo3SPtTYOAHgjoizKpug",
    oauth_consumer_secret: "DtWtTnewJLINEmnshVG47lyivxlyeDD68h2w6LqotY",
    callback: xo.Environment.isTouch() ? "http://aanon4.github.com/callback/" : location.origin + "/callback",
  },
  twitterResolve:
  {
    "X-PHX": true
  },
  embedly: "bca772cc366611e1b6634040d3dc5c07",
  ga: "UA-28788100-1"
};
var Co = xo.Co;
var Class = xo.Class;
var Log = xo.Log;
var Model = xo.Model;
var ModelSet = xo.ModelSet;
var IndexedModelSet = xo.IndexedModelSet;
var FilteredModelSet = xo.FilteredModelSet;
var Mixin = xo.Mixin;
var Events = xo.Events;
var RootView = xo.RootView;
var OAuth = xo.OAuth;
var Menu = xo.Menu;
var Url = xo.Url;
var Ajax = xo.Ajax;
var AjaxStream = xo.AjaxStream;
var Storage = xo.Storage;
var RemoteStorage = xo.RemoteStorage;
var Drag = xo.Drag;
var Environment = xo.Environment;
var ModalView = xo.ModalView;

var KEYS = KEYS || {};

var grid = new xo.Grid(32);
// Google Analytics
var _gaq = _gaq || [];
if (KEYS.ga)
{
  _gaq.push(['_setAccount', KEYS.ga]);
  _gaq.push(['_trackPageview', '/load']);

  Log.on("start", function()
  {
    _gaq.push(['_trackPageview', '/start']);
  });

  Log.on("metric", function(evt, info)
  {
    _gaq.push(['_trackEvent', info.category, info.action, info.description, info.value]);
  });

  Log.on("exception", function(evt, info)
  {
    _gaq.push(['_trackEvent', "exception", "unexpected", "", info[0] + ":" + info[1] ]);
    Log.error("Exception: ", info[0], info[1] && (info[1].stack || info[1]));
  });

  Log.on("timing", function(evt, info)
  {
    if (info[0] === "runtime")
    {
      _gaq.push(['_trackEvent', "timing", "runtime", "", info[1] / 1000 ]);
    }
    Log.info(info[0], info[1] + "ms");
  });

  Log.on("action", function(evt, info)
  {
    if (info.event && info.event.view && info.event.view.$name === "tweets")
    {
      switch (info.type)
      {
        case "scroll-to-top":
          Log.metric("list", "top:scroll");
          break;
        case "scroll-insert-above":
          Log.metric("list", "top:insert");
          break;
        case "scroll-insert-below":
          Log.metric("list", "bottom:insert");
          break;
      }
    }
  });

  (function(){var g=void 0,h=!0,i=null,j=!1,aa=encodeURIComponent,ba=Infinity,ca=setTimeout,da=decodeURIComponent,k=Math;function ea(a,b){return a.onload=b}function fa(a,b){return a.name=b}
  var m="push",ga="slice",ha="replace",ia="load",ja="floor",ka="cookie",n="charAt",la="value",p="indexOf",ma="match",q="name",na="host",t="toString",u="length",v="prototype",pa="clientWidth",w="split",qa="stopPropagation",ra="scope",x="location",y="getString",sa="random",ta="clientHeight",ua="href",z="substring",va="navigator",A="join",C="toLowerCase",D;function wa(a,b){switch(b){case 0:return""+a;case 1:return 1*a;case 2:return!!a;case 3:return 1E3*a}return a}function E(a,b){return g==a||"-"==a&&!b||""==a}function xa(a){if(!a||""==a)return"";for(;a&&-1<" \n\r\t"[p](a[n](0));)a=a[z](1);for(;a&&-1<" \n\r\t"[p](a[n](a[u]-1));)a=a[z](0,a[u]-1);return a}function ya(a){var b=1,c=0,d;if(!E(a)){b=0;for(d=a[u]-1;0<=d;d--)c=a.charCodeAt(d),b=(b<<6&268435455)+c+(c<<14),c=b&266338304,b=0!=c?b^c>>21:b}return b}
  function za(){return k.round(2147483647*k[sa]())}function Aa(){}function Ba(a,b){if(aa instanceof Function)return b?encodeURI(a):aa(a);F(68);return escape(a)}function G(a){a=a[w]("+")[A](" ");if(da instanceof Function)try{return da(a)}catch(b){F(17)}else F(68);return unescape(a)}
  var Ca=function(a,b,c,d){a.addEventListener?a.addEventListener(b,c,!!d):a.attachEvent&&a.attachEvent("on"+b,c)},Da=function(a,b,c,d){a.removeEventListener?a.removeEventListener(b,c,!!d):a.detachEvent&&a.detachEvent("on"+b,c)};function H(a){return a&&0<a[u]?a[0]:""}function Ea(a){var b=a?a[u]:0;return 0<b?a[b-1]:""}var Fa=function(){this.prefix="ga.";this.I={}};Fa[v].set=function(a,b){this.I[this.prefix+a]=b};Fa[v].get=function(a){return this.I[this.prefix+a]};
  Fa[v].contains=function(a){return this.get(a)!==g};function Ga(a){0==a[p]("www.")&&(a=a[z](4));return a[C]()}function Ha(a,b){var c,d={url:a,protocol:"http",host:"",path:"",c:new Fa,anchor:""};if(!a)return d;c=a[p]("://");0<=c&&(d.protocol=a[z](0,c),a=a[z](c+3));c=a.search("/|\\?|#");if(0<=c)d.host=a[z](0,c)[C](),a=a[z](c);else return d.host=a[C](),d;c=a[p]("#");0<=c&&(d.anchor=a[z](c+1),a=a[z](0,c));c=a[p]("?");0<=c&&(Ia(d.c,a[z](c+1)),a=a[z](0,c));d.anchor&&b&&Ia(d.c,d.anchor);a&&"/"==a[n](0)&&(a=a[z](1));d.path=a;return d}
  function Ia(a,b){function c(b,c){a.contains(b)||a.set(b,[]);a.get(b)[m](c)}for(var d=xa(b)[w]("&"),e=0;e<d[u];e++)if(d[e]){var f=d[e][p]("=");0>f?c(d[e],"1"):c(d[e][z](0,f),d[e][z](f+1))}}function Ja(a,b){if(E(a)||"["==a[n](0)&&"]"==a[n](a[u]-1))return"-";var c=I.domain;return a[p](c+(b&&"/"!=b?b:""))==(0==a[p]("http://")?7:0==a[p]("https://")?8:0)?"0":a};function Ka(a,b,c){1<=100*k[sa]()||(a=["utmt=error","utmerr="+a,"utmwv=5.2.3","utmn="+za(),"utmsp=1"],b&&a[m]("api="+b),c&&a[m]("msg="+Ba(c[z](0,100))),J.q&&a[m]("aip=1"),La(a[A]("&")))};var Ma=0;function K(a){return(a?"_":"")+Ma++}
  var Na=K(),Oa=K(),Pa=K(),Qa=K(),Ra=K(),L=K(),M=K(),Sa=K(),Ta=K(),Ua=K(),Va=K(),Wa=K(),Xa=K(),Ya=K(),Za=K(),$a=K(),ab=K(),bb=K(),cb=K(),db=K(),eb=K(),fb=K(),gb=K(),hb=K(),ib=K(),jb=K(),kb=K(),lb=K(),mb=K(),nb=K(),ob=K(),pb=K(),qb=K(),rb=K(),sb=K(),N=K(h),tb=K(),ub=K(),vb=K(),wb=K(),xb=K(),yb=K(),zb=K(),Ab=K(),Bb=K(),Cb=K(),O=K(h),Db=K(h),Eb=K(h),Gb=K(h),Hb=K(h),Ib=K(h),Jb=K(h),Kb=K(h),Lb=K(h),Mb=K(h),Nb=K(h),P=K(h),Ob=K(h),Pb=K(h),Qb=K(h),Rb=K(h),Sb=K(h),Tb=K(h),Ub=K(h),Vb=K(h),Wb=K(h),Xb=K(h),Yb=
  K(h),Zb=K(h),$b=K(h),ac=K(),bc=K(),cc=K();K();var dc=K(),ec=K(),fc=K(),gc=K(),hc=K(),ic=K(),jc=K(),kc=K(),lc=K(),pc=K();K();var qc=K(),rc=K(),sc=K();var tc=function(){function a(a,c,d){Q(R[v],a,c,d)}S("_getName",Pa,58);S("_getAccount",Na,64);S("_visitCode",O,54);S("_getClientInfo",Ya,53,1);S("_getDetectTitle",ab,56,1);S("_getDetectFlash",Za,65,1);S("_getLocalGifPath",kb,57);S("_getServiceMode",lb,59);T("_setClientInfo",Ya,66,2);T("_setAccount",Na,3);T("_setNamespace",Oa,48);T("_setAllowLinker",Va,11,2);T("_setDetectFlash",Za,61,2);T("_setDetectTitle",ab,62,2);T("_setLocalGifPath",kb,46,0);T("_setLocalServerMode",lb,92,g,0);T("_setRemoteServerMode",
  lb,63,g,1);T("_setLocalRemoteServerMode",lb,47,g,2);T("_setSampleRate",jb,45,1);T("_setCampaignTrack",$a,36,2);T("_setAllowAnchor",Wa,7,2);T("_setCampNameKey",cb,41);T("_setCampContentKey",hb,38);T("_setCampIdKey",bb,39);T("_setCampMediumKey",fb,40);T("_setCampNOKey",ib,42);T("_setCampSourceKey",eb,43);T("_setCampTermKey",gb,44);T("_setCampCIdKey",db,37);T("_setCookiePath",M,9,0);T("_setMaxCustomVariables",mb,0,1);T("_setVisitorCookieTimeout",Sa,28,1);T("_setSessionCookieTimeout",Ta,26,1);T("_setCampaignCookieTimeout",
  Ua,29,1);T("_setReferrerOverride",vb,49);T("_setSiteSpeedSampleRate",lc,132);a("_trackPageview",R[v].na,1);a("_trackEvent",R[v].v,4);a("_trackPageLoadTime",R[v].ma,100);a("_trackSocial",R[v].oa,104);a("_trackTrans",R[v].pa,18);a("_sendXEvent",R[v].u,78);a("_createEventTracker",R[v].V,74);a("_getVersion",R[v].$,60);a("_setDomainName",R[v].t,6);a("_setAllowHash",R[v].ea,8);a("_getLinkerUrl",R[v].Z,52);a("_link",R[v].link,101);a("_linkByPost",R[v].da,102);a("_setTrans",R[v].ha,20);a("_addTrans",R[v].O,
  21);a("_addItem",R[v].M,19);a("_setTransactionDelim",R[v].ia,82);a("_setCustomVar",R[v].fa,10);a("_deleteCustomVar",R[v].X,35);a("_getVisitorCustomVar",R[v].aa,50);a("_setXKey",R[v].ka,83);a("_setXValue",R[v].la,84);a("_getXKey",R[v].ba,76);a("_getXValue",R[v].ca,77);a("_clearXKey",R[v].S,72);a("_clearXValue",R[v].T,73);a("_createXObj",R[v].W,75);a("_addIgnoredOrganic",R[v].K,15);a("_clearIgnoredOrganic",R[v].P,97);a("_addIgnoredRef",R[v].L,31);a("_clearIgnoredRef",R[v].Q,32);a("_addOrganic",R[v].N,
  14);a("_clearOrganic",R[v].R,70);a("_cookiePathCopy",R[v].U,30);a("_get",R[v].Y,106);a("_set",R[v].ga,107);a("_addEventListener",R[v].addEventListener,108);a("_removeEventListener",R[v].removeEventListener,109);a("_initData",R[v].m,2);a("_setVar",R[v].ja,22);T("_setSessionTimeout",Ta,27,3);T("_setCookieTimeout",Ua,25,3);T("_setCookiePersistence",Sa,24,1);a("_setAutoTrackOutbound",Aa,79);a("_setTrackOutboundSubdomains",Aa,81);a("_setHrefExamineLimit",Aa,80)},Q=function(a,b,c,d){a[b]=function(){try{return F(d),
  c.apply(this,arguments)}catch(a){throw Ka("exc",b,a&&a[q]),a;}}},S=function(a,b,c,d){R[v][a]=function(){try{return F(c),wa(this.a.get(b),d)}catch(e){throw Ka("exc",a,e&&e[q]),e;}}},T=function(a,b,c,d,e){R[v][a]=function(f){try{F(c),e==g?this.a.set(b,wa(f,d)):this.a.set(b,e)}catch(l){throw Ka("exc",a,l&&l[q]),l;}}},uc=function(a,b){return{type:b,target:a,stopPropagation:function(){throw"aborted";}}};var vc=function(a,b){return"/"!==b?j:(0==a[p]("www.google.")||0==a[p](".google.")||0==a[p]("google."))&&!(-1<a[p]("google.org"))?h:j},wc=function(a){var b=a.get(Ra),c=a[y](M,"/");vc(b,c)&&a[qa]()};var Bc=function(){var a={},b={},c=new xc;this.g=function(a,b){c.add(a,b)};var d=new xc;this.d=function(a,b){d.add(a,b)};var e=j,f=j,l=h;this.J=function(){e=h};this.f=function(a){this[ia]();this.set(ac,a,h);a=new yc(this);e=j;d.execute(this);e=h;b={};this.i();a.qa()};this.load=function(){e&&(e=j,this.sa(),zc(this),f||(f=h,c.execute(this),Ac(this),zc(this)),e=h)};this.i=function(){if(e)if(f)e=j,Ac(this),e=h;else this[ia]()};this.get=function(c){c&&"_"==c[n](0)&&this[ia]();return b[c]!==g?b[c]:a[c]};
  this.set=function(c,d,e){c&&"_"==c[n](0)&&this[ia]();e?b[c]=d:a[c]=d;c&&"_"==c[n](0)&&this.i()};this.n=function(b){a[b]=this.b(b,0)+1};this.b=function(a,b){var c=this.get(a);return c==g||""===c?b:1*c};this.getString=function(a,b){var c=this.get(a);return c==g?b:c+""};this.sa=function(){if(l){var b=this[y](Ra,""),c=this[y](M,"/");vc(b,c)||(a[L]=a[Xa]&&""!=b?ya(b):1,l=j)}}};Bc[v].stopPropagation=function(){throw"aborted";};
  var yc=function(a){var b=this;this.j=0;var c=a.get(bc);this.Aa=function(){0<b.j&&c&&(b.j--,b.j||c())};this.qa=function(){!b.j&&c&&ca(c,10)};a.set(cc,b,h)};function Cc(a,b){for(var b=b||[],c=0;c<b[u];c++){var d=b[c];if(""+a==d||0==d[p](a+"."))return d}return"-"}
  var Ec=function(a,b,c){c=c?"":a[y](L,"1");b=b[w](".");if(6!==b[u]||Dc(b[0],c))return j;var c=1*b[1],d=1*b[2],e=1*b[3],f=1*b[4],b=1*b[5];if(!(0<=c&&0<d&&0<e&&0<f&&0<=b))return F(110),j;a.set(O,c);a.set(Hb,d);a.set(Ib,e);a.set(Jb,f);a.set(Kb,b);return h},Fc=function(a){var b=a.get(O),c=a.get(Hb),d=a.get(Ib),e=a.get(Jb),f=a.b(Kb,1);b==g?F(113):NaN==b&&F(114);0<=b&&0<c&&0<d&&0<e&&0<=f||F(115);return[a.b(L,1),b!=g?b:"-",c||"-",d||"-",e||"-",f][A](".")},Gc=function(a){return[a.b(L,1),a.b(Nb,0),a.b(P,1),
  a.b(Ob,0)][A](".")},Hc=function(a,b,c){var c=c?"":a[y](L,"1"),d=b[w](".");if(4!==d[u]||Dc(d[0],c))d=i;a.set(Nb,d?1*d[1]:0);a.set(P,d?1*d[2]:10);a.set(Ob,d?1*d[3]:a.get(Qa));return d!=i||!Dc(b,c)},Ic=function(a,b){var c=Ba(a[y](Eb,"")),d=[],e=a.get(N);if(!b&&e){for(var f=0;f<e[u];f++){var l=e[f];l&&1==l[ra]&&d[m](f+"="+Ba(l[q])+"="+Ba(l[la])+"=1")}0<d[u]&&(c+="|"+d[A]("^"))}return c?a.b(L,1)+"."+c:i},Jc=function(a,b,c){c=c?"":a[y](L,"1");b=b[w](".");if(2>b[u]||Dc(b[0],c))return j;b=b[ga](1)[A](".")[w]("|");
  0<b[u]&&a.set(Eb,G(b[0]));if(1>=b[u])return h;for(var c=b[1][w](-1==b[1][p](",")?"^":","),d=0;d<c[u];d++){var e=c[d][w]("=");if(4==e[u]){var f={};fa(f,G(e[1]));f.value=G(e[2]);f.scope=1;a.get(N)[e[0]]=f}}0<=b[1][p]("^")&&F(125);return h},Lc=function(a,b){var c=Kc(a,b);return c?[a.b(L,1),a.b(Pb,0),a.b(Qb,1),a.b(Rb,1),c][A]("."):""},Kc=function(a){function b(b,e){if(!E(a.get(b))){var f=a[y](b,""),f=f[w](" ")[A]("%20"),f=f[w]("+")[A]("%20");c[m](e+"="+f)}}var c=[];b(Tb,"utmcid");b(Xb,"utmcsr");b(Vb,
  "utmgclid");b(Wb,"utmdclid");b(Ub,"utmccn");b(Yb,"utmcmd");b(Zb,"utmctr");b($b,"utmcct");return c[A]("|")},Nc=function(a,b,c){c=c?"":a[y](L,"1");b=b[w](".");if(5>b[u]||Dc(b[0],c))return a.set(Pb,g),a.set(Qb,g),a.set(Rb,g),a.set(Tb,g),a.set(Ub,g),a.set(Xb,g),a.set(Yb,g),a.set(Zb,g),a.set($b,g),a.set(Vb,g),a.set(Wb,g),j;a.set(Pb,1*b[1]);a.set(Qb,1*b[2]);a.set(Rb,1*b[3]);Mc(a,b[ga](4)[A]("."));return h},Mc=function(a,b){function c(a){return(a=b[ma](a+"=(.*?)(?:\\|utm|$)"))&&2==a[u]?a[1]:g}function d(b,
  c){c&&(c=e?G(c):c[w]("%20")[A](" "),a.set(b,c))}-1==b[p]("=")&&(b=G(b));var e="2"==c("utmcvr");d(Tb,c("utmcid"));d(Ub,c("utmccn"));d(Xb,c("utmcsr"));d(Yb,c("utmcmd"));d(Zb,c("utmctr"));d($b,c("utmcct"));d(Vb,c("utmgclid"));d(Wb,c("utmdclid"))},Dc=function(a,b){return b?a!=b:!/^\d+$/.test(a)};var xc=function(){this.s=[]};xc[v].add=function(a,b){this.s[m]({name:a,Ea:b})};xc[v].execute=function(a){try{for(var b=0;b<this.s[u];b++)this.s[b].Ea.call(U,a)}catch(c){}};function Oc(a){100!=a.get(jb)&&a.get(O)%1E4>=100*a.get(jb)&&a[qa]()}function Pc(a){Qc()&&a[qa]()}function Rc(a){"_file:"==I[x].protocol&&a[qa]()}function Sc(a){a.get(ub)||a.set(ub,I.title,h);a.get(tb)||a.set(tb,I[x].pathname+I[x].search,h)};var Tc=new function(){var a=[];this.set=function(b){a[b]=h};this.Fa=function(){for(var b=[],c=0;c<a[u];c++)a[c]&&(b[k[ja](c/6)]=b[k[ja](c/6)]^1<<c%6);for(c=0;c<b[u];c++)b[c]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[n](b[c]||0);return b[A]("")+"~"}};function F(a){Tc.set(a)};var U=window,I=document,Qc=function(){var a=U._gaUserPrefs;return a&&a.ioo&&a.ioo()},Uc=function(a,b){ca(a,b)},V=function(a){for(var b=[],c=I[ka][w](";"),a=RegExp("^\\s*"+a+"=\\s*(.*?)\\s*$"),d=0;d<c[u];d++){var e=c[d][ma](a);e&&b[m](e[1])}return b},W=function(a,b,c,d,e){var f;f=Qc()?j:vc(d,c)?j:h;if(f){if(b&&0<=U[va].userAgent[p]("Firefox")){b=b[ha](/\n|\r/g," ");f=0;for(var l=b[u];f<l;++f){var o=b.charCodeAt(f)&255;if(10==o||13==o)b=b[z](0,f)+"?"+b[z](f+1)}}b&&2E3<b[u]&&(b=b[z](0,2E3),F(69));a=
  a+"="+b+"; path="+c+"; ";e&&(a+="expires="+(new Date((new Date).getTime()+e)).toGMTString()+"; ");d&&(a+="domain="+d+";");I.cookie=a}};var Vc,Wc,Xc=function(){if(!Vc){var a={},b=U[va],c=U.screen;a.H=c?c.width+"x"+c.height:"-";a.G=c?c.colorDepth+"-bit":"-";a.language=(b&&(b.language||b.browserLanguage)||"-")[C]();a.javaEnabled=b&&b.javaEnabled()?1:0;a.characterSet=I.characterSet||I.charset||"-";try{var d=I.documentElement,e=I.body,f=e&&e[pa]&&e[ta],b=[];d&&d[pa]&&d[ta]&&("CSS1Compat"===I.compatMode||!f)?b=[d[pa],d[ta]]:f&&(b=[e[pa],e[ta]]);a.Ba=b[A]("x")}catch(l){F(135)}Vc=a}},Yc=function(){Xc();for(var a=Vc,b=U[va],a=b.appName+b.version+
  a.language+b.platform+b.userAgent+a.javaEnabled+a.H+a.G+(I[ka]?I[ka]:"")+(I.referrer?I.referrer:""),b=a[u],c=U.history[u];0<c;)a+=c--^b++;return ya(a)},Zc=function(a){Xc();var b=Vc;a.set(xb,b.H);a.set(yb,b.G);a.set(Bb,b.language);a.set(Cb,b.characterSet);a.set(zb,b.javaEnabled);a.set(sc,b.Ba);if(a.get(Ya)&&a.get(Za)){if(!(b=Wc)){var c,d,e;d="ShockwaveFlash";if((b=(b=U[va])?b.plugins:g)&&0<b[u])for(c=0;c<b[u]&&!e;c++)d=b[c],-1<d[q][p]("Shockwave Flash")&&(e=d.description[w]("Shockwave Flash ")[1]);
  else{d=d+"."+d;try{c=new ActiveXObject(d+".7"),e=c.GetVariable("$version")}catch(f){}if(!e)try{c=new ActiveXObject(d+".6"),e="WIN 6,0,21,0",c.AllowScriptAccess="always",e=c.GetVariable("$version")}catch(l){}if(!e)try{c=new ActiveXObject(d),e=c.GetVariable("$version")}catch(o){}e&&(e=e[w](" ")[1][w](","),e=e[0]+"."+e[1]+" r"+e[2])}b=e?e:"-"}Wc=b;a.set(Ab,Wc)}else a.set(Ab,"-")};var X=function(){Q(X[v],"push",X[v][m],5);Q(X[v],"_createAsyncTracker",X[v].Ca,33);Q(X[v],"_getAsyncTracker",X[v].Da,34);this.r=0};X[v].Ca=function(a,b){return J.l(a,b||"")};X[v].Da=function(a){return J.p(a)};X[v].push=function(a){0<this.r&&F(105);this.r++;for(var b=arguments,c=0,d=0;d<b[u];d++)try{if("function"===typeof b[d])b[d]();else{var e="",f=b[d][0],l=f.lastIndexOf(".");0<l&&(e=f[z](0,l),f=f[z](l+1));var o="_gat"==e?J:"_gaq"==e?$c:J.p(e);o[f].apply(o,b[d][ga](1))}}catch(r){c++}this.r--;return c};var dd=function(){function a(a,b,c,d){g==f[a]&&(f[a]={});g==f[a][b]&&(f[a][b]=[]);f[a][b][c]=d}function b(a,b,c){if(g!=f[a]&&g!=f[a][b])return f[a][b][c]}function c(a,b){if(g!=f[a]&&g!=f[a][b]){f[a][b]=g;var c=h,d;for(d=0;d<l[u];d++)if(g!=f[a][l[d]]){c=j;break}c&&(f[a]=g)}}function d(a){var b="",c=j,d,e;for(d=0;d<l[u];d++)if(e=a[l[d]],g!=e){c&&(b+=l[d]);for(var c=[],f=g,Z=g,Z=0;Z<e[u];Z++)if(g!=e[Z]){f="";Z!=$&&g==e[Z-1]&&(f+=Z[t]()+oa);for(var cd=e[Z],mc="",Fb=g,nc=g,oc=g,Fb=0;Fb<cd[u];Fb++)nc=cd[n](Fb),
  oc=B[nc],mc+=g!=oc?oc:nc;f+=mc;c[m](f)}b+=o+c[A](s)+r;c=j}else c=h;return b}var e=this,f=[],l=["k","v"],o="(",r=")",s="*",oa="!",B={"'":"'0"};B[r]="'1";B[s]="'2";B[oa]="'3";var $=1;e.va=function(a){return g!=f[a]};e.o=function(){for(var a="",b=0;b<f[u];b++)g!=f[b]&&(a+=b[t]()+d(f[b]));return a};e.ua=function(a){if(a==g)return e.o();for(var b=a.o(),c=0;c<f[u];c++)g!=f[c]&&!a.va(c)&&(b+=c[t]()+d(f[c]));return b};e.e=function(b,c,d){if(!ad(d))return j;a(b,"k",c,d);return h};e.k=function(b,c,d){if(!bd(d))return j;
  a(b,"v",c,d[t]());return h};e.getKey=function(a,c){return b(a,"k",c)};e.C=function(a,c){return b(a,"v",c)};e.A=function(a){c(a,"k")};e.B=function(a){c(a,"v")};Q(e,"_setKey",e.e,89);Q(e,"_setValue",e.k,90);Q(e,"_getKey",e.getKey,87);Q(e,"_getValue",e.C,88);Q(e,"_clearKey",e.A,85);Q(e,"_clearValue",e.B,86)};function ad(a){return"string"==typeof a}function bd(a){return"number"!=typeof a&&(g==Number||!(a instanceof Number))||k.round(a)!=a||NaN==a||a==ba?j:h};var ed=function(a){var b=U.gaGlobal;a&&!b&&(U.gaGlobal=b={});return b},fd=function(){var a=ed(h).hid;a==i&&(a=za(),ed(h).hid=a);return a},gd=function(a){a.set(wb,fd());var b=ed();if(b&&b.dh==a.get(L)){var c=b.sid;c&&("0"==c&&F(112),a.set(Jb,c),a.get(Db)&&a.set(Ib,c));b=b.vid;a.get(Db)&&b&&(b=b[w]("."),1*b[1]||F(112),a.set(O,1*b[0]),a.set(Hb,1*b[1]))}};var hd,id=function(a,b,c){var d=a[y](Ra,""),e=a[y](M,"/"),a=a.b(Sa,0);W(b,c,e,d,a)},Ac=function(a){var b=a[y](Ra,"");a.b(L,1);var c=a[y](M,"/");W("__utma",Fc(a),c,b,a.get(Sa));W("__utmb",Gc(a),c,b,a.get(Ta));W("__utmc",""+a.b(L,1),c,b);var d=Lc(a,h);d?W("__utmz",d,c,b,a.get(Ua)):W("__utmz","",c,b,-1);(d=Ic(a,j))?W("__utmv",d,c,b,a.get(Sa)):W("__utmv","",c,b,-1)},zc=function(a){var b=a.b(L,1);if(!Ec(a,Cc(b,V("__utma"))))return a.set(Gb,h),j;var c=!Hc(a,Cc(b,V("__utmb")));a.set(Mb,c);Nc(a,Cc(b,V("__utmz")));
  Jc(a,Cc(b,V("__utmv")));hd=!c;return h},jd=function(a){hd||0<V("__utmb")[u]||(W("__utmd","1",a[y](M,"/"),a[y](Ra,""),1E4),0==V("__utmd")[u]&&a[qa]())};var md=function(a){a.get(O)==g?kd(a):a.get(Gb)&&!a.get(qc)?kd(a):a.get(Mb)&&ld(a)},nd=function(a){a.get(Sb)&&!a.get(Lb)&&(ld(a),a.set(Qb,a.get(Kb)))},kd=function(a){var b=a.get(Qa);a.set(Db,h);a.set(O,za()^Yc(a)&2147483647);a.set(Eb,"");a.set(Hb,b);a.set(Ib,b);a.set(Jb,b);a.set(Kb,1);a.set(Lb,h);a.set(Nb,0);a.set(P,10);a.set(Ob,b);a.set(N,[]);a.set(Gb,j);a.set(Mb,j)},ld=function(a){a.set(Ib,a.get(Jb));a.set(Jb,a.get(Qa));a.n(Kb);a.set(Lb,h);a.set(Nb,0);a.set(P,10);a.set(Ob,a.get(Qa));a.set(Mb,j)};var od="daum:q,eniro:search_word,naver:query,pchome:q,images.google:q,google:q,yahoo:p,yahoo:q,msn:q,bing:q,aol:query,aol:q,lycos:query,ask:q,netscape:query,cnn:query,about:terms,mamma:q,voila:rdata,virgilio:qs,live:q,baidu:wd,alice:qs,yandex:text,najdi:q,seznam:q,search:q,wp:szukaj,onet:qt,yam:k,kvasir:q,ozu:q,terra:query,rambler:query".split(","),ud=function(a){if(a.get($a)&&!a.get(qc)){for(var b=!E(a.get(Tb))||!E(a.get(Xb))||!E(a.get(Vb))||!E(a.get(Wb)),c={},d=0;d<pd[u];d++){var e=pd[d];c[e]=a.get(e)}d=
  Ha(I[x][ua],a.get(Wa));if(!("1"==Ea(d.c.get(a.get(ib)))&&b)&&(d=qd(a,d)||rd(a),!d&&!b&&a.get(Lb)&&(sd(a,g,"(direct)",g,g,"(direct)","(none)",g,g),d=h),d&&(a.set(Sb,td(a,c)),b="(direct)"==a.get(Xb)&&"(direct)"==a.get(Ub)&&"(none)"==a.get(Yb),a.get(Sb)||a.get(Lb)&&!b)))a.set(Pb,a.get(Qa)),a.set(Qb,a.get(Kb)),a.n(Rb)}},qd=function(a,b){function c(c,d){var d=d||"-",e=Ea(b.c.get(a.get(c)));return e&&"-"!=e?G(e):d}var d=Ea(b.c.get(a.get(bb)))||"-",e=Ea(b.c.get(a.get(eb)))||"-",f=Ea(b.c.get(a.get(db)))||
  "-",l=Ea(b.c.get("dclid"))||"-",o=c(cb,"(not set)"),r=c(fb,"(not set)"),s=c(gb),oa=c(hb);if(E(d)&&E(f)&&E(l)&&E(e))return j;if(E(s)){var B=Ja(a.get(vb),a.get(M)),B=Ha(B,h);(B=vd(a,B))&&!E(B[1]&&!B[2])&&(s=B[1])}sd(a,d,e,f,l,o,r,s,oa);return h},rd=function(a){var b=Ja(a.get(vb),a.get(M)),c=Ha(b,h);if(!(b!=g&&b!=i&&""!=b&&"0"!=b&&"-"!=b&&0<=b[p]("://"))||c&&-1<c[na][p]("google")&&c.c.contains("q")&&"cse"==c.path)return j;if((b=vd(a,c))&&!b[2])return sd(a,g,b[0],g,g,"(organic)","organic",b[1],g),h;if(b)return j;
  if(a.get(Lb))a:{for(var b=a.get(pb),d=Ga(c[na]),e=0;e<b[u];++e)if(-1<d[p](b[e])){a=j;break a}sd(a,g,d,g,g,"(referral)","referral",g,"/"+c.path);a=h}else a=j;return a},vd=function(a,b){for(var c=a.get(nb),d=0;d<c[u];++d){var e=c[d][w](":");if(-1<b[na][p](e[0][C]())){var f=b.c.get(e[1]);if(f&&(f=H(f),!f&&-1<b[na][p]("google.")&&(f="(not provided)"),!e[3]||-1<b.url[p](e[3]))){a:{for(var c=f,d=a.get(ob),c=G(c)[C](),l=0;l<d[u];++l)if(c==d[l]){c=h;break a}c=j}return[e[2]||e[0],f,c]}}}return i},sd=function(a,
  b,c,d,e,f,l,o,r){a.set(Tb,b);a.set(Xb,c);a.set(Vb,d);a.set(Wb,e);a.set(Ub,f);a.set(Yb,l);a.set(Zb,o);a.set($b,r)},pd=[Ub,Tb,Vb,Wb,Xb,Yb,Zb,$b],td=function(a,b){function c(a){a=(""+a)[w]("+")[A]("%20");return a=a[w](" ")[A]("%20")}function d(c){var d=""+(a.get(c)||""),c=""+(b[c]||"");return 0<d[u]&&d==c}if(d(Vb)||d(Wb))return F(131),j;for(var e=0;e<pd[u];e++){var f=pd[e],l=b[f]||"-",f=a.get(f)||"-";if(c(l)!=c(f))return h}return j};var xd=function(a){wd(a,I[x][ua])?(a.set(qc,h),F(12)):a.set(qc,j)},wd=function(a,b){if(!a.get(Va))return j;var c=Ha(b,a.get(Wa)),d=H(c.c.get("__utma")),e=H(c.c.get("__utmb")),f=H(c.c.get("__utmc")),l=H(c.c.get("__utmx")),o=H(c.c.get("__utmz")),r=H(c.c.get("__utmv")),c=H(c.c.get("__utmk"));if(ya(""+d+e+f+l+o+r)!=c){d=G(d);e=G(e);f=G(f);l=G(l);a:{for(var f=d+e+f+l,s=0;3>s;s++){for(var oa=0;3>oa;oa++){if(c==ya(f+o+r)){F(127);c=[o,r];break a}var B=o[ha](/ /g,"%20"),$=r[ha](/ /g,"%20");if(c==ya(f+B+$)){F(128);
  c=[B,$];break a}B=B[ha](/\+/g,"%20");$=$[ha](/\+/g,"%20");if(c==ya(f+B+$)){F(129);c=[B,$];break a}o=G(o)}r=G(r)}c=g}if(!c)return j;o=c[0];r=c[1]}if(!Ec(a,d,h))return j;Hc(a,e,h);Nc(a,o,h);Jc(a,r,h);yd(a,l,h);return h},Ad=function(a,b,c){var d;d=Fc(a)||"-";var e=Gc(a)||"-",f=""+a.b(L,1)||"-",l=zd(a)||"-",o=Lc(a,j)||"-",a=Ic(a,j)||"-",r=ya(""+d+e+f+l+o+a),s=[];s[m]("__utma="+d);s[m]("__utmb="+e);s[m]("__utmc="+f);s[m]("__utmx="+l);s[m]("__utmz="+o);s[m]("__utmv="+a);s[m]("__utmk="+r);d=s[A]("&");if(!d)return b;
  e=b[p]("#");if(c)return 0>e?b+"#"+d:b+"&"+d;c="";f=b[p]("?");0<e&&(c=b[z](e),b=b[z](0,e));return 0>f?b+"?"+d+c:b+"&"+d+c};var Bd="|",Dd=function(a,b,c,d,e,f,l,o,r){var s=Cd(a,b);s||(s={},a.get(qb)[m](s));s.id_=b;s.affiliation_=c;s.total_=d;s.tax_=e;s.shipping_=f;s.city_=l;s.state_=o;s.country_=r;s.items_=s.items_||[];return s},Ed=function(a,b,c,d,e,f,l){var a=Cd(a,b)||Dd(a,b,"",0,0,0,"","",""),o;a:{if(a&&a.items_){o=a.items_;for(var r=0;r<o[u];r++)if(o[r].sku_==c){o=o[r];break a}}o=i}r=o||{};r.transId_=b;r.sku_=c;r.name_=d;r.category_=e;r.price_=f;r.quantity_=l;o||a.items_[m](r);return r},Cd=function(a,b){for(var c=
  a.get(qb),d=0;d<c[u];d++)if(c[d].id_==b)return c[d];return i};var Fd,Gd=function(a){if(!Fd){var b,c=I[x].hash;b=U[q];var d=/^#?gaso=([^&]*)/;if(c=(b=(c=c&&c[ma](d)||b&&b[ma](d))?c[1]:H(V("GASO")))&&b[ma](/^(?:\|([-0-9a-z.]{1,40})\|)?([-.\w]{10,1200})$/i))if(id(a,"GASO",""+b),J._gasoDomain=a.get(Ra),J._gasoCPath=a.get(M),b=a=c[1],"adwords"!=b&&(b="www"),c="https://"+(b+".google.com")+"/analytics/reporting/overlay_js?gaso="+c[2]+(a?"&prefix="+a:"")+"&"+za())a=I.createElement("script"),a.type="text/javascript",a.async=h,a.src=c,a.id="_gasojs",ea(a,g),c=I.getElementsByTagName("script")[0],
  c.parentNode.insertBefore(a,c);Fd=h}};var yd=function(a,b,c){c&&(b=G(b));c=a.b(L,1);b=b[w](".");!(2>b[u])&&/^\d+$/.test(b[0])&&(b[0]=""+c,id(a,"__utmx",b[A](".")))},zd=function(a,b){var c=Cc(a.get(L),V("__utmx"));"-"==c&&(c="");return b?Ba(c):c};var Ld=function(a,b){var c=k.min(a.b(lc,0),10);if(a.b(O,0)%100>=c)return j;c=Hd()||Id();if(c==g)return j;var d=c[0];if(d==g||d==ba||isNaN(d))return j;0<d?(1>1E3*k[sa]()&&F(124),Jd(c)?b(Kd(c)):b(Kd(c[ga](0,1)))):Ca(U,"load",function(){Ld(a,b)},j);return h},Jd=function(a){for(var b=1;b<a[u];b++)if(isNaN(a[b])||a[b]==ba||0>a[b])return j;return h},Kd=function(a){for(var b=new dd,c=0;c<a[u];c++)b.e(14,c+1,(isNaN(a[c])||0>a[c]?0:5E3>a[c]?10*k[ja](a[c]/10):45E4>a[c]?100*k[ja](a[c]/100):45E4)+""),b.k(14,
  c+1,a[c]);return b},Hd=function(){var a=U.performance||U.webkitPerformance;if(a=a&&a.timing){var b=a.navigationStart;if(0==b)F(133);else return[a.loadEventStart-b,a.domainLookupEnd-a.domainLookupStart,a.connectEnd-a.connectStart,a.responseStart-a.requestStart,a.responseEnd-a.responseStart,a.fetchStart-b]}},Id=function(){if(U.top==U){var a=U.external,b=a&&a.onloadT;a&&!a.isValidLoadTime&&(b=g);2147483648<b&&(b=g);0<b&&a.setPageReadyTime();return b==g?g:[b]}};var R=function(a,b,c){function d(a){return function(b){if((b=b.get(rc)[a])&&b[u])for(var c=uc(e,a),d=0;d<b[u];d++)b[d].call(e,c)}}var e=this;this.a=new Bc;this.get=function(a){return this.a.get(a)};this.set=function(a,b,c){this.a.set(a,b,c)};this.set(Na,b||"UA-XXXXX-X");this.set(Pa,a||"");this.set(Oa,c||"");this.set(Qa,k.round((new Date).getTime()/1E3));this.set(M,"/");this.set(Sa,63072E6);this.set(Ua,15768E6);this.set(Ta,18E5);this.set(Va,j);this.set(mb,50);this.set(Wa,j);this.set(Xa,h);this.set(Ya,
  h);this.set(Za,h);this.set($a,h);this.set(ab,h);this.set(cb,"utm_campaign");this.set(bb,"utm_id");this.set(db,"gclid");this.set(eb,"utm_source");this.set(fb,"utm_medium");this.set(gb,"utm_term");this.set(hb,"utm_content");this.set(ib,"utm_nooverride");this.set(jb,100);this.set(lc,1);this.set(pc,j);this.set(kb,"/__utm.gif");this.set(lb,1);this.set(qb,[]);this.set(N,[]);this.set(nb,od[ga](0));this.set(ob,[]);this.set(pb,[]);this.t("auto");this.set(vb,this.ra());this.set(rc,{hit:[],load:[]});this.a.g("0",
  xd);this.a.g("1",md);this.a.g("2",ud);this.a.g("3",nd);this.a.g("4",d("load"));this.a.g("5",Gd);this.a.d("A",Pc);this.a.d("B",Rc);this.a.d("C",md);this.a.d("D",Oc);this.a.d("E",wc);this.a.d("F",Md);this.a.d("G",jd);this.a.d("H",Sc);this.a.d("I",Zc);this.a.d("J",gd);this.a.d("K",d("hit"));this.a.d("L",Nd);this.a.d("M",Od);0===this.get(Qa)&&F(111);this.a.J();this.w=g};D=R[v];D.h=function(){var a=this.get(rb);a||(a=new dd,this.set(rb,a));return a};
  D.ta=function(a){for(var b in a){var c=a[b];a.hasOwnProperty(b)&&"function"!=typeof c&&this.set(b,c,h)}};D.z=function(a){if(this.get(pc))return j;var b=this,c=Ld(this.a,function(c){b.set(tb,a,h);b.u(c)});this.set(pc,c);return c};D.na=function(a){a&&a!=g&&-1<(a.constructor+"")[p]("String")?(F(13),this.set(tb,a,h)):"object"===typeof a&&a!==i&&this.ta(a);this.w=a=this.get(tb);1>=1E3*k[sa]()&&Pd();this.a.f("page");this.z(a)};
  D.v=function(a,b,c,d,e){if(""==a||!ad(a)||""==b||!ad(b)||c!=g&&!ad(c)||d!=g&&!bd(d))return j;this.set(ec,a,h);this.set(fc,b,h);this.set(gc,c,h);this.set(hc,d,h);this.set(dc,!!e,h);this.a.f("event");return h};D.oa=function(a,b,c,d){if(!a||!b)return j;this.set(ic,a,h);this.set(jc,b,h);this.set(kc,c||I[x][ua],h);d&&this.set(tb,d,h);this.a.f("social");return h};D.ma=function(){this.set(lc,10);this.z(this.w)};D.pa=function(){this.a.f("trans")};D.u=function(a){this.set(sb,a,h);this.a.f("event")};
  D.V=function(a){this.m();var b=this;return{_trackEvent:function(c,d,e){F(91);b.v(a,c,d,e)}}};D.Y=function(a){return this.get(a)};D.ga=function(a,b){if(a)if(a!=g&&-1<(a.constructor+"")[p]("String"))this.set(a,b);else if("object"==typeof a)for(var c in a)a.hasOwnProperty(c)&&this.set(c,a[c])};D.addEventListener=function(a,b){var c=this.get(rc)[a];c&&c[m](b)};D.removeEventListener=function(a,b){for(var c=this.get(rc)[a],d=0;c&&d<c[u];d++)if(c[d]==b){c.splice(d,1);break}};D.$=function(){return"5.2.3"};
  D.t=function(a){this.get(Xa);a="auto"==a?Ga(I.domain):!a||"-"==a||"none"==a?"":a[C]();this.set(Ra,a)};D.ea=function(a){this.set(Xa,!!a)};D.Z=function(a,b){return Ad(this.a,a,b)};D.link=function(a,b){if(this.a.get(Va)&&a){var c=Ad(this.a,a,b);I[x].href=c}};D.da=function(a,b){this.a.get(Va)&&a&&a.action&&(a.action=Ad(this.a,a.action,b))};
  D.ha=function(){this.m();var a=this.a,b=I.getElementById?I.getElementById("utmtrans"):I.utmform&&I.utmform.utmtrans?I.utmform.utmtrans:i;if(b&&b[la]){a.set(qb,[]);for(var b=b[la][w]("UTM:"),c=0;c<b[u];c++){b[c]=xa(b[c]);for(var d=b[c][w](Bd),e=0;e<d[u];e++)d[e]=xa(d[e]);"T"==d[0]?Dd(a,d[1],d[2],d[3],d[4],d[5],d[6],d[7],d[8]):"I"==d[0]&&Ed(a,d[1],d[2],d[3],d[4],d[5],d[6])}}};D.O=function(a,b,c,d,e,f,l,o){return Dd(this.a,a,b,c,d,e,f,l,o)};D.M=function(a,b,c,d,e,f){return Ed(this.a,a,b,c,d,e,f)};
  D.ia=function(a){Bd=a||"|"};D.fa=function(a,b,c,d){var e=this.a;if(0>=a||a>e.get(mb)||!b||!c||128<b[u]+c[u])a=j;else{1!=d&&2!=d&&(d=3);var f={};fa(f,b);f.value=c;f.scope=d;e.get(N)[a]=f;a=h}a&&this.a.i();return a};D.X=function(a){this.a.get(N)[a]=g;this.a.i()};D.aa=function(a){return(a=this.a.get(N)[a])&&1==a[ra]?a[la]:g};D.ka=function(a,b,c){this.h().e(a,b,c)};D.la=function(a,b,c){this.h().k(a,b,c)};D.ba=function(a,b){return this.h().getKey(a,b)};D.ca=function(a,b){return this.h().C(a,b)};D.S=function(a){this.h().A(a)};
  D.T=function(a){this.h().B(a)};D.W=function(){return new dd};D.K=function(a){a&&this.get(ob)[m](a[C]())};D.P=function(){this.set(ob,[])};D.L=function(a){a&&this.get(pb)[m](a[C]())};D.Q=function(){this.set(pb,[])};D.N=function(a,b,c,d,e){if(a&&b){a=[a,b[C]()][A](":");if(d||e)a=[a,d,e][A](":");d=this.get(nb);d.splice(c?0:d[u],0,a)}};D.R=function(){this.set(nb,[])};D.U=function(a){this.a[ia]();var b=this.get(M),c=zd(this.a);this.set(M,a);this.a.i();yd(this.a,c);this.set(M,b)};
  D.ra=function(){var a="";try{var b=Ha(I[x][ua],j),a=da(Ea(b.c.get("utm_referrer")))||""}catch(c){F(146)}return a||I.referrer};D.m=function(){this.a[ia]()};D.ja=function(a){a&&""!=a&&(this.set(Eb,a),this.a.f("var"))};var Pd=function(){function a(a,b){(0==c[p](a)||-1<c[p]("; "+a))&&F(b)}function b(a,b){U[a]!==g&&F(b)}F(137);var c=I[ka];a("ga=",138);a("_ga=",139);a("ga2=",140);a("_a=",141);b("ga",142);b("_ga",143);b("ga2",144);b("_a",145)};var Md=function(a){"trans"!==a.get(ac)&&500<=a.b(Nb,0)&&a[qa]();if("event"===a.get(ac)){var b=(new Date).getTime(),c=a.b(Ob,0),d=a.b(Jb,0),c=k[ja](1*((b-(c!=d?c:1E3*c))/1E3));0<c&&(a.set(Ob,b),a.set(P,k.min(10,a.b(P,0)+c)));0>=a.b(P,0)&&a[qa]()}},Od=function(a){"event"===a.get(ac)&&a.set(P,k.max(0,a.b(P,10)-1))};var Qd=function(){var a=[];this.add=function(b,c,d){d&&(c=Ba(""+c));a[m](b+"="+c)};this.toString=function(){return a[A]("&")}},Rd=function(a,b){(b||2!=a.get(lb))&&a.n(Nb)},Sd=function(a,b){b.add("utmwv","5.2.3");b.add("utms",a.get(Nb));b.add("utmn",za());var c=I[x].hostname;E(c)||b.add("utmhn",c,h);c=a.get(jb);100!=c&&b.add("utmsp",c,h)},Ud=function(a,b){b.add("utmac",a.get(Na));a.get(dc)&&b.add("utmni",1);Td(a,b);J.q&&b.add("aip",1);b.add("utmu",Tc.Fa())},Td=function(a,b){function c(a,b){b&&d[m](a+
  "="+b+";")}var d=[];c("__utma",Fc(a));c("__utmz",Lc(a,j));c("__utmv",Ic(a,h));c("__utmx",zd(a));b.add("utmcc",d[A]("+"),h)},Vd=function(a,b){a.get(Ya)&&(b.add("utmcs",a.get(Cb),h),b.add("utmsr",a.get(xb)),a.get(sc)&&b.add("utmvp",a.get(sc)),b.add("utmsc",a.get(yb)),b.add("utmul",a.get(Bb)),b.add("utmje",a.get(zb)),b.add("utmfl",a.get(Ab),h))},Wd=function(a,b){a.get(ab)&&a.get(ub)&&b.add("utmdt",a.get(ub),h);b.add("utmhid",a.get(wb));b.add("utmr",Ja(a.get(vb),a.get(M)),h);b.add("utmp",Ba(a.get(tb),
  h),h)},Xd=function(a,b){for(var c=a.get(rb),d=a.get(sb),e=a.get(N)||[],f=0;f<e[u];f++){var l=e[f];l&&(c||(c=new dd),c.e(8,f,l[q]),c.e(9,f,l[la]),3!=l[ra]&&c.e(11,f,""+l[ra]))}!E(a.get(ec))&&!E(a.get(fc),h)&&(c||(c=new dd),c.e(5,1,a.get(ec)),c.e(5,2,a.get(fc)),e=a.get(gc),e!=g&&c.e(5,3,e),e=a.get(hc),e!=g&&c.k(5,1,e));c?b.add("utme",c.ua(d),h):d&&b.add("utme",d.o(),h)},Yd=function(a,b,c){var d=new Qd;Rd(a,c);Sd(a,d);d.add("utmt","tran");d.add("utmtid",b.id_,h);d.add("utmtst",b.affiliation_,h);d.add("utmtto",
  b.total_,h);d.add("utmttx",b.tax_,h);d.add("utmtsp",b.shipping_,h);d.add("utmtci",b.city_,h);d.add("utmtrg",b.state_,h);d.add("utmtco",b.country_,h);!c&&Ud(a,d);return d[t]()},Zd=function(a,b,c){var d=new Qd;Rd(a,c);Sd(a,d);d.add("utmt","item");d.add("utmtid",b.transId_,h);d.add("utmipc",b.sku_,h);d.add("utmipn",b.name_,h);d.add("utmiva",b.category_,h);d.add("utmipr",b.price_,h);d.add("utmiqt",b.quantity_,h);!c&&Ud(a,d);return d[t]()},$d=function(a,b){var c=a.get(ac);if("page"==c)c=new Qd,Rd(a,b),
  Sd(a,c),Xd(a,c),Vd(a,c),Wd(a,c),b||Ud(a,c),c=[c[t]()];else if("event"==c)c=new Qd,Rd(a,b),Sd(a,c),c.add("utmt","event"),Xd(a,c),Vd(a,c),Wd(a,c),!b&&Ud(a,c),c=[c[t]()];else if("var"==c)c=new Qd,Rd(a,b),Sd(a,c),c.add("utmt","var"),!b&&Ud(a,c),c=[c[t]()];else if("trans"==c)for(var c=[],d=a.get(qb),e=0;e<d[u];++e){c[m](Yd(a,d[e],b));for(var f=d[e].items_,l=0;l<f[u];++l)c[m](Zd(a,f[l],b))}else"social"==c?b?c=[]:(c=new Qd,Rd(a,b),Sd(a,c),c.add("utmt","social"),c.add("utmsn",a.get(ic),h),c.add("utmsa",a.get(jc),
  h),c.add("utmsid",a.get(kc),h),Xd(a,c),Vd(a,c),Wd(a,c),Ud(a,c),c=[c[t]()]):c=[];return c},Nd=function(a){var b,c=a.get(lb),d=a.get(cc),e=d&&d.Aa,f=0;if(0==c||2==c){var l=a.get(kb)+"?";b=$d(a,h);for(var o=0,r=b[u];o<r;o++)La(b[o],e,l,h),f++}if(1==c||2==c){b=$d(a);o=0;for(r=b[u];o<r;o++)try{La(b[o],e),f++}catch(s){s&&Ka(s[q],g,s.message)}}d&&(d.j=f)};var ae="https:"==I[x].protocol?"https://ssl.google-analytics.com":"http://www.google-analytics.com",be=function(a){fa(this,"len");this.message=a+"-8192"},ce=function(a){fa(this,"ff2post");this.message=a+"-2036"},La=function(a,b,c,d){b=b||Aa;if(d||2036>=a[u])de(a,b,c);else if(8192>=a[u]){if(0<=U[va].userAgent[p]("Firefox")&&![].reduce)throw new ce(a[u]);ee(a,b)||fe(a,b)}else throw new be(a[u]);},de=function(a,b,c){var c=c||ae+"/__utm.gif?",d=new Image(1,1);d.src=c+a;ea(d,function(){ea(d,i);d.onerror=
  i;b()});d.onerror=function(){ea(d,i);d.onerror=i;b()}},ee=function(a,b){var c,d=ae+"/p/__utm.gif",e=U.XDomainRequest;if(e)c=new e,c.open("POST",d);else if(e=U.XMLHttpRequest)e=new e,"withCredentials"in e&&(c=e,c.open("POST",d,h),c.setRequestHeader("Content-Type","text/plain"));if(c)return c.onreadystatechange=function(){4==c.readyState&&(b(),c=i)},c.send(a),h},fe=function(a,b){if(I.body){a=aa(a);try{var c=I.createElement('<iframe name="'+a+'"></iframe>')}catch(d){c=I.createElement("iframe"),fa(c,
  a)}c.height="0";c.width="0";c.style.display="none";c.style.visibility="hidden";var e=I[x],e=ae+"/u/post_iframe.html#"+aa(e.protocol+"//"+e[na]+"/favicon.ico"),f=function(){c.src="";c.parentNode&&c.parentNode.removeChild(c)};Ca(U,"beforeunload",f);var l=j,o=0,r=function(){if(!l){try{if(9<o||c.contentWindow[x][na]==I[x][na]){l=h;f();Da(U,"beforeunload",f);b();return}}catch(a){}o++;ca(r,200)}};Ca(c,"load",r);I.body.appendChild(c);c.src=e}else Uc(function(){fe(a,b)},100)};var Y=function(){this.q=j;this.D={};this.F=[];this.wa=0;this._gasoCPath=this._gasoDomain=g;Q(Y[v],"_createTracker",Y[v].l,55);Q(Y[v],"_getTracker",Y[v].ya,0);Q(Y[v],"_getTrackerByName",Y[v].p,51);Q(Y[v],"_getTrackers",Y[v].za,130);Q(Y[v],"_anonymizeIp",Y[v].xa,16);tc()};D=Y[v];D.ya=function(a,b){return this.l(a,g,b)};D.l=function(a,b,c){b&&F(23);c&&F(67);b==g&&(b="~"+J.wa++);a=new R(b,a,c);J.D[b]=a;J.F[m](a);return a};D.p=function(a){a=a||"";return J.D[a]||J.l(g,a)};D.za=function(){return J.F[ga](0)};
  D.xa=function(){this.q=h};var ge=function(a){if("prerender"==I.webkitVisibilityState)return j;a();return h};var J=new Y;var he=U._gat;he&&"function"==typeof he._getTracker?J=he:U._gat=J;var $c=new X;(function(a){if(!ge(a)){F(123);var b=j,c=function(){!b&&ge(a)&&(b=h,Da(I,"webkitvisibilitychange",c))};Ca(I,"webkitvisibilitychange",c)}})(function(){var a=U._gaq,b=j;if(a&&"function"==typeof a[m]&&(b="[object Array]"==Object[v][t].call(Object(a)),!b)){$c=a;return}U._gaq=$c;b&&$c[m].apply($c,a)});})();
}
var Tweet = Model.create(
{
  id: Model.ROProperty("id_str"),
  text: Model.ROProperty,
  created_at: Model.ROProperty,

  constructor: function(__super, values, account, reduce)
  {
    this._account = account
    if (reduce === true)
    {
      __super(this._reduce(values));
    }
    else
    {
      __super(values);
    }
    this._buildImageUrl();
  },

  _reduce: function(values)
  {
    return {
      id_str: values.retweeted_status ? values.retweeted_status.id_str : values.id_str,
      entities: values.entities,
      text: values.text,
      user: values.user && { name: values.user.name, screen_name: values.user.screen_name, profile_image_url: values.user.profile_image_url, id_str: values.user.id_str, lang: values.user.lang },
      sender: values.sender && { name: values.sender.name, screen_name: values.sender.screen_name, profile_image_url: values.sender.profile_image_url, id_str: values.sender.id_str, lang: values.sender.lang },
      recipient: values.recipient && { name: values.recipient.name, screen_name: values.recipient.screen_name, profile_image_url: values.recipient.profile_image_url, id_str: values.recipient.id_str, lang: values.recipient.lang },
      from_user_name: values.from_user_name,
      from_user: values.from_user,
      iso_language_code: values.iso_language_code,
      profile_image_url: values.profile_image_url,
      created_at: values.created_at,
      favorited: values.favorited,
      place: values.place && { full_name: values.place.full_name, id: values.place.id },
      geo: values.geo && { coordinates: values.geo.coordinates },
      retweeted_status: values.retweeted_status && this._reduce(values.retweeted_status),
      in_reply_to_status_id_str: values.in_reply_to_status_id_str
    }
  },

  entifiedText: function()
  {
    if (!this._text)
    {
      var entities = this._values.entities;
      if (entities)
      {
        var txt = [ { type: "text", value: this._values.text, length: this._values.text.length } ];
        function split(type, entityset)
        {
          if (entityset)
          {
            for (var i = entityset.length - 1; i >= 0; i--)
            {
              var entity = entityset[i];
              var start = entity.indices[0];
              var length = entity.indices[1] - start;
              var offset = 0;
              for (var ti = 0, tlen = txt.length; ti < tlen; ti++)
              {
                var t = txt[ti];
                if (t.type == "text" && start >= offset && start + length <= offset + t.length)
                {
                  if (start == offset && length == t.length)
                  {
                    t.type = type;
                    t.entity = entity;
                  }
                  else
                  {
                    var nt = { type: type, value: t.value.substr(start - offset, length), length: length, entity: entity };
                    if (start == offset)
                    {
                      t.value = t.value.substr(length);
                      t.length = t.value.length;
                      txt.splice(ti, 0, nt);
                    }
                    else if (start - offset + length == t.length)
                    {
                      t.value = t.value.substr(0, start - offset);
                      t.length = t.value.length;
                      txt.splice(ti + 1, 0, nt);
                    }
                    else
                    {
                      var end = { type: "text", value: t.value.substr(start + length - offset), length: 0 };
                      end.length = end.value.length;
                      t.value = t.value.substr(0, start - offset);
                      t.length = t.value.length;
                      txt.splice(ti + 1, 0, nt, end);
                    }
                  }
                  break;
                }
                else
                {
                  offset += t.length;
                }
              }
            }
          }
        }
        split("media", entities.media);
        split("url", entities.urls);
        split("user_mentions", entities.user_mentions);
        split("hashtags", entities.hashtags);

        function durl(t)
        {
          return t.entity.resolved_display_url || t.entity.display_url || t.entity.expanded_url || t.entity.url;
        }

        var text = "";
        for (var i = 0, len = txt.length; i < len; i++)
        {
          var t = txt[i];
          switch (t.type)
          {
            case "media":
              text += '<span class="media" data-action-click="Image" data-href="' + t.entity.media_url + '" data-full-href="' + (t.entity.resolved_url || t.entity.url) + '">' + durl(t) + '</span>';
              break;
            case "url":
              text += '<span class="url" data-action-click="Url" data-href="' + t.entity.url + '" title="' + (t.entity.resolved_url || t.entity.url) +'">' + durl(t) + '</span>';
              break;
            case "user_mentions":
              text += '<span class="user_mention" data-action-click="Mention" data-name="' + t.value + '">' + t.value + '</span>';
              break;
            case "hashtags":
              text += '<span class="hashtag" data-action-click="Hashtag">' + t.value + '</span>';
              break;
            default:
              text += t.value;
              break;
          }
        }
        this._text = text;
      }
      else
      {
        this._text = this._values.text;
      }
    }
    return this._text;
  },

  name: function()
  {
    if (this._values.user)
    {
      return this._values.user.name;
    }
    else if (this._values.sender)
    {
      return this._values.sender.name;
    }
    else
    {
      return this._values.from_user_name;
    }
  },

  screen_name: function()
  {
    if (this._values.user)
    {
      return this._values.user.screen_name;
    }
    else if (this._values.sender)
    {
      return this._values.sender.screen_name;
    }
    else
    {
      return this._values.from_user;
    }
  },

  at_screen_name: function()
  {
    return "@" + this.screen_name();
  },

  conversation: function()
  {
    if (this._values.user)
    {
      return this._values.user.screen_name;
    }
    else if (this._values.sender)
    {
      if ("@" + this._values.sender.screen_name.toLowerCase() === this._account.tweetLists.screenname)
      {
        return this._values.recipient.screen_name;
      }
      else
      {
        return this._values.sender.screen_name;
      }
    }
    else
    {
      return this._values.from_user;
    }
  },
  
  profile_image_url: function()
  {
    if (!this._profile_image_url)
    {
      this._profile_image_url = "http://api.twitter.com/1/users/profile_image/" + this.screen_name() + Tweet.profileImgExt;
    }
    return this._profile_image_url;
  },

  user: function()
  {
    if (this._values.user)
    {
      return this._values.user;
    }
    else if (this._values.sender)
    {
      if ("@" + this._values.sender.screen_name.toLowerCase() === this._account.tweetLists.screenname)
      {
        return this._values.recipient;
      }
      else
      {
        return this._values.sender;
      }
    }
    else
    {
      return this._values;
    }
  },

  _buildImageUrl: function()
  {
    if (this.isDM())
    {
      Co.Routine(this,
        function()
        {
          return Composite.mergeIcons(this._values.recipient.profile_image_url, this._values.sender.profile_image_url, 48, 32, 5);
        },
        function(url)
        {
          this._profile_image_url = url();
          this.emit("update");
        }
      );
    }
  },

  embed_photo_url_small: function()
  {
    if (this._embed_photo_url_small === undefined)
    {
      this._embed_photo_url_small = null;
      if (this.is_retweet())
      {
        this._embed_photo_url_small = this.retweet().embed_photo_url_small();
      }
      else
      {
        var media = this._getFirstMediaType("photo");
        if (media)
        {
          this._embed_photo_url_small = media.media_url + (media.sizes ? ":small" : "");
        }
        else
        {
          media = this._getFirstMediaType("video");
          if (media)
          {
            this._embed_photo_url_small = media.media_url;
          }
        }
      }
    }
    return this._embed_photo_url_small;
  },

  embed_photo_url: function()
  {
    if (this._embed_photo_url === undefined)
    {
      this._embed_photo_url = null;
      if (this.is_retweet())
      {
        this._embed_photo_url = this.retweet().embed_photo_url();
      }
      else
      {
        var media = this._getFirstMediaType("photo");
        if (media)
        {
          this._embed_photo_url = media.media_url;
        }
        else
        {
          media = this._getFirstMediaType("video");
          if (media)
          {
            this._embed_photo_url = media.media_url;
          }
        }
      }
    }
    return this._embed_photo_url;
  },

  _getFirstMediaType: function(type)
  {
    var m = this._values.entities && this._values.entities.media;
    if (m && m.length)
    {
      for (var i = m.length - 1; i >= 0; i--)
      {
        var media = m[i];
        if (media.type === type)
        {
          return media;
        }
      }
    }
    return null;
  },

  urls: function()
  {
    var urls = [];
    var entities = this._values.entities;
    if (entities)
    {
      entities.urls && entities.urls.forEach(function(url)
      {
        url.expanded_url && urls.push(url.expanded_url);
      }, this);
      entities.media && entities.media.forEach(function(media)
      {
        urls.push(media.media_url + (media.sizes ? ":small" : ""));
      }, this);
    }
    return urls;
  },

  oembeds: function(oembeds)
  {
    var entities = this._values.entities;
    if (entities)
    {
      entities.urls && entities.urls.forEach(function(url, idx, array)
      {
        var o = url.expanded_url && oembeds[url.expanded_url];
        if (o)
        {
          switch (o.type)
          {
            case "photo":
            case "video":
              array.splice(idx, 1);
              var media = entities.media || (entities.media = []);
              media.push(
              {
                type: o.type,
                media_url: o.media_url || o.url,
                display_url: o.url,
                resolved_url: o.url,
                resolved_display_url: o.url && this.make_display_url(o.url),
                html: o.html,
                htmlLarge: o.html,
                indices: url.indices
              });
              break;

            default:
              url.resolved_url = o.url;
              url.resolved_display_url = this.make_display_url(o.url);
              break;
          }
        }
      }, this);
      entities.media && entities.media.forEach(function(media)
      {
        var o = oembeds[media.media_url + (media.sizes ? ":small" : "")];
        if (o)
        {
          media.resolved_url = o.url;
          media.resolved_display_url = this.make_display_url(o.url);
        }
      }, this);
      this._tags = null;
      this._tagsHash = null;
    }
  },

  created_at: function()
  {
    return this._values.created_at;
  },

  created_since: function()
  {
    return Tweet.tweetTime(this._values.created_at);
  },

  isDM: function()
  {
    return this.hasTagKey(Tweet.DMTag.hashkey);
  },

  isMention: function()
  {
    return this.hasTagKey(Tweet.MentionTag.hashkey);
  },

  hasTagKey: function(key)
  {
    return this.tagsHash()[key] || false;
  },

  favorited: function(nv)
  {
    var model = this.is_retweet() ? this.retweet() : this;
    if (arguments.length)
    {
      var ov = Model.updateProperty(model, "favorited", nv);
      if (ov !== nv)
      {
        this._tags = null;
        this._tagsHash = null;
        this.emit("update.favorited");
        this.emit("update");
      }
      return ov;
    }
    else
    {
      return Model.updateProperty(model, "favorited");
    }
  },

  tags: function()
  {
    if (!this._tags)
    {
      this._buildTags();
    }
    return this._tags;
  },

  tagsHash: function()
  {
    if (!this._tags)
    {
      this._buildTags();
    }
    return this._tagsHash;
  },

  tagkeys: function()
  {
    if (!this._tags)
    {
      this._buildTags();
    }
    if (!this._tagkeys)
    {
      var keys = "";
      this._tags.forEach(function(key)
      {
        switch (key.type)
        {
          case "screenname":
          case "hashtag":
          case "hostname":
          case "topic":
          case "lang":
            keys += key.key + " ";
          default:
            break;
        }
      });
      this._tagkeys = keys.slice(0, -1);
    }
    return this._tagkeys;
  },

  _buildTags: function()
  {
    var used = {};
    var tags = [];
    if (this.is_retweet())
    {
      var retweet = this.retweet();
      retweet._buildTags();
      tags = retweet._tags;
      used = retweet._tagsHash;
      retweet._tags = null;
      retweet._tagsHash = null;
      var name = this.at_screen_name();
      var key = name.toLowerCase();
      if (!used["screenname:" + key])
      {
        tags.unshift({ title: name, type: "screenname", key: key });
        used["screenname:" + key] = true;
        this._account.userAndTags.addUser(this.screen_name(), this.name());
      }
      delete used[Tweet.TweetTag.hashkey];
      used[Tweet.RetweetTag.hashkey] = true;
      tags[tags.length - 1] = Tweet.RetweetTag;
    }
    else
    {
      var name = this.at_screen_name();
      var key = name.toLowerCase();
      used["screenname:" + key] = true;
      tags.push({ title: name, type: "screenname", key: key });
      this._account.userAndTags.addUser(this.screen_name(), this.name());

      Topics.lookupByScreenName(key).forEach(function(topic)
      {
        var key = topic.title.toLowerCase();
        used["topic:" + key] = true;
        tags.push({ title: topic.title, type: "topic", key: key });
      });

      var recipient = this._values.recipient;
      if (recipient)
      {
        var name = "@" + recipient.screen_name;
        var key = name.toLowerCase();
        used["screenname:" + key] = true;
        tags.push({ title: name, type: "screenname", key: key });
        this._account.userAndTags.addUser(recipient.screen_name, recipient.name);
      }

      var entities = this._values.entities;
      if (entities)
      {
        var me = this._account.tweetLists.screenname;
        entities.user_mentions && entities.user_mentions.forEach(function(mention)
        {
          var name = "@" + mention.screen_name;
          var key = name.toLowerCase();
          if (!used["screenname:" + key])
          {
            used["screenname:" + key] = true;
            tags.push({ title: name, type: "screenname", key: key });
            this._account.userAndTags.addUser(mention.screen_name, mention.name);
            if (key === me && !used[Tweet.MentionTag.hashkey])
            {
              used[Tweet.MentionTag.hashkey] = true;
              tags.push(Tweet.MentionTag);
            }
          }
        }, this);
        entities.hashtags && entities.hashtags.forEach(function(hashtag)
        {
          var key = "#" + hashtag.text.toLowerCase();
          if (!used["hashtag:" + key])
          {
            used["hashtag:" + key] = true;
            tags.push({ title: "#" + hashtag.text, type: "hashtag", key: key });
            this._account.userAndTags.addHashtag(hashtag.text);
          }
        }, this);
        entities.urls && entities.urls.forEach(function(url)
        {
          url = url.resolved_url || url.expanded_url;
          if (url)
          {
            var hostname = new Url(url).hostname.toLowerCase();
            if (!used["hostname:" + hostname])
            {
              used["hostname:" + hostname] = true;
              tags.push({ title: hostname, type: "hostname", key: hostname });
            }
          }
        });
        entities.media && entities.media.forEach(function(media)
        {
          var url = media.resolved_url || media.expanded_url;
          if (url)
          {
            if (media.type === "photo" && !used[Tweet.PhotoTag.hashkey])
            {
              used[Tweet.PhotoTag.hashkey] = true;
              tags.push(Tweet.PhotoTag);
            }
            else if (media.type === "video" && !used[Tweet.VideoTag.hashkey])
            {
              used[Tweet.VideoTag.hashkey] = true;
              tags.push(Tweet.VideoTag);
            }
            var hostname = new Url(url).hostname.toLowerCase();
            if (!used["hostname:" + hostname])
            {
              used["hostname:" + hostname] = true;
              tags.push({ title: hostname, type: "hostname", key: hostname });
            }
          }
        });
      }

      if (this._values.place)
      {
        var name = this._values.place.full_name;
        used[Tweet.PlaceTag.hashkey] = true;
        tags.push({ title: name, type: "somewhere", key: "place:" + this._values.place.id });
        tags.push(Tweet.PlaceTag);
      }
      else if (this._values.geo)
      {
        var co = this._values.geo.coordinates;
        var name = co[0] + "," + co[1];
        used[Tweet.GeoTag.hashkey] = true;
        tags.push({ title: name, type: "somewhere", key: 'near:"' + name + '"' });
        tags.push(Tweet.GeoTag);
      }
      if (this.favorited())
      {
        used[Tweet.FavoriteTag.hashkey] = true;
        tags.push(Tweet.FavoriteTag);
      }
      var u = this._values.user || this._values.sender;
      if (u && u.lang && u.lang !== Tweet.language)
      {
        used["lang:" + u.lang] = true;
        tags.push({ title: u.lang, type: "lang", key: u.lang });
      }
      else if (this._values.iso_language_code && this._values.iso_language_code !== Tweet.language)
      {
        used["lang:" + this._values.iso_language_code] = true;
        tags.push({ title: this._values.iso_language_code, type: "lang", key: this._values.iso_language_code });
      }
      if (this._values.recipient)
      {
        used[Tweet.DMTag.hashkey] = true;
        tags.push(Tweet.DMTag);
      }
      else
      {
        used[Tweet.TweetTag.hashkey] = true;
        tags.push(Tweet.TweetTag);
      }
    }
    this._tags = tags;
    this._tagsHash = used;
  },

  is_retweet: function()
  {
    return this._values.retweeted_status ? true : false;
  },

  retweet: function()
  {
    if (this._retweet === undefined)
    {
      var rt = this._values.retweeted_status;
      this._retweet = rt ? new Tweet(rt, this._account, false) : false;
    }
    return this._retweet;
  },

  in_reply_to: function()
  {
    if (this._replytweet === undefined)
    {
      this._replytweet = null;
      var rid = this._values.in_reply_to_status_id_str;
      if (rid)
      {
        var reply = this._account.tweetLists.getTweet(rid);
        if (reply)
        {
          this._replytweet = reply;
        }
      }
    }
    return this._replytweet;
  },

  make_display_url: function(url)
  {
    url = new Url(url);
    var fullname = url.pathname + url.search + url.hash;
    var pathname = fullname.slice(0, 15);
    return url.hostname + pathname + (fullname === pathname ? "" : "...");
  }
}).statics(
{
  language: navigator.language.split("-")[0],

  profileImgExt: Environment.isRetina() ? ".png?size=bigger" : ".png",

  tweetTime: function(created_at, type)
  {
    type && (type.relative = true);
    var date = new Date(created_at);
    var since = parseInt((Date.now() - date.getTime()) / 1000);
    if (since < 60)
    {
      return since + "s";
    }
    since = parseInt(since / 60);
    if (since < 60)
    {
      return since + "m";
    }
    since = parseInt(since / 60);
    if (since < 24)
    {
      return since + "h";
    }
    else
    {
      type && (type.relative = false);
      date = date.toDateString().split(" ");
      return date[1] + " " + date[2];
    }
  },

  compareTweets: function(a, b)
  {
    return Tweet.compareTweetIds(a.id(), b.id());
  },

  compareRawTweets: function(a, b)
  {
    return Tweet.compareTweetIds(a.id_str, b.id_str);
  },

  compareTweetIds: function(aid, bid)
  {
    var aidl = aid.length;
    var bidl = bid.length;
    if (aidl < bidl)
    {
      return 1;
    }
    else if (aidl > bidl)
    {
      return -1;
    }
    else if (aid < bid)
    {
      return 1;
    }
    else if (aid > bid)
    {
      return -1;
    }
    else
    {
      return 0;
    }
  },

  TweetTag: { title: "Tweet", type: "tweet", key: "tweet", hashkey: "tweet:tweet" },
  RetweetTag: { title: "Retweet", type: "retweet", key: "retweet", hashkey: "retweet:retweet" },
  MentionTag: { title: "Mention", type: "mention", key: "mention", hashkey: "mention:mention" },
  DMTag: { title: "DM", type: "dm", key: "dm", hashkey: "dm:dm" },
  FavoriteTag: { title: "Favorite", type: "fav", key: "favorite", hashkey: "fav:favorite" },
  PhotoTag: { title: "Photo", type: "topic", key: "photo", hashkey: "topic:photo" },
  VideoTag: { title: "Video", type: "topic", key: "video", hashkey: "topic:video" },
  PlaceTag: { title: "Place", type: "topic", key: "place", hashkey: "topic:place" },
  GeoTag: { title: "Geo", type: "topic", key: "geo", hashkey: "topic:geo" }
});
var FilteredTweetsModel = Model.create(
{
  uuid: Model.Property,
  title: Model.Property,
  name: Model.Property,
  canRemove: Model.Property,
  tweets: Model.Property,
  unread: Model.Property,
  velocity: Model.Property,
  lastRead: Model.Property,
  viz: Model.Property,

  constructor: function(__super, values)
  {
    var self = this;
    __super(values);
    self._lgrid = grid.get();
    self.tweets(new FilteredModelSet({ key: "id", limit: values.limit || 1000 }));
    self.unread(0);
    self.velocity(0);
    self._includeTags = [];
    self._excludeTags = [];
    self._tweetLists = values.account.tweetLists;
    self.viz(self.viz() || "list");
    self._removed = false;
  },

  restore: function(isNew)
  {
    return Co.Routine(this,
      function()
      {
        return isNew || this._restore();
      },
      function()
      {
        this.updateUnreadAndVelocity();
        this.on("update.tweets update.includeTags update.excludeTags update.lastRead update.viz", function()
        {
          this._save();
        }, this);
        return true;
      }
    );
  },

  addTweets: function(tweets)
  {
    var ntweets;
    var otweets = this.tweets();
    if (otweets.length() === 0)
    {
      ntweets = tweets;
    }
    else
    {
      ntweets = [];
      tweets.forEach(function(twt)
      {
        if (!otweets.findByProperty("id", twt.id()))
        {
          ntweets.push(twt);
        }
      });
    }
    if (ntweets.length)
    {
      if (this.tweets().prepend(ntweets))
      {
        this.emit("update.tweets");
        this.emit("update");
      }
    }
  },

  removeTweets: function(tweets)
  {
    if (tweets.length)
    {
      if (this.tweets().remove(tweets))
      {
        this.emit("update.tweets");
        this.emit("update");
      }
    }
  },

  addIncludeTag: function(tag, refilter)
  {
    if (this._tagIndex(this._includeTags, tag) === -1)
    {
      var filter = this._makeRule(tag);
      this._includeTags.push({ tag: tag, filter: filter });
      this.tweets().addIncludeFilter(filter, refilter);
      this.emit("update.includeTags");
      this.emit("update");
    }
  },

  addExcludeTag: function(tag, refilter)
  {
    if (this._tagIndex(this._excludeTags, tag) === -1)
    {
      var filter = this._makeRule(tag);
      this._excludeTags.push({ tag: tag, filter: filter });
      this.tweets().addExcludeFilter(filter, refilter);
      this.emit("update.excludeTags");
      this.emit("update");
    }
  },

  removeIncludeTag: function(tag, refilter)
  {
    var idx = this._tagIndex(this._includeTags, tag);
    if (idx !== -1)
    {
      var e = this._includeTags.splice(idx, 1);
      this.tweets().removeIncludeFilter(e[0].filter, refilter);
      this.emit("update.includeTags");
      this.emit("update");
    }
  },

  removeExcludeTag: function(tag, refilter)
  {
    var idx = this._tagIndex(this._excludeTags, tag);
    if (idx !== -1)
    {
      var e = this._excludeTags.splice(idx, 1);
      this.tweets().removeExcludeFilter(e[0].filter, refilter);
      this.emit("update.excludeTags");
      this.emit("update");
    }
  },

  isSearch: function()
  {
    return this.title().slice(-1) === "?";
  },

  asSearch: function()
  {
    if (!this.isSearch())
    {
      return null;
    }
    else
    {
      return this.title().slice(0, -1);
    }
  },

  isDM: function()
  {
    var tags = this.includeTags();
    return tags.length === 1 && tags[0].tag.type === Tweet.DMTag.type;
  },

  _tagIndex: function(list, tag)
  {
    for (var i = list.length - 1; i >= 0; i--)
    {
      if (list[i].tag.type === tag.type && list[i].tag.key === tag.key)
      {
        return i;
      }
    }
    return -1;
  },

  _makeRule: function(tag)
  {
    var key = tag.type + ":" + tag.key;
    return function(tweet)
    {
      return tweet.hasTagKey(key);
    };
  },

  _defaultAll: [{ tag: { title: "All", type: "default", key: "all", hashkey: "default:all" } }],
  _defaultNone: [{ tag: { title: "None", type: "default", key: "none", hashkey: "default:none" } }],

  includeTags: function()
  {
    return this._includeTags.length ? this._includeTags : this._defaultAll;
  },

  excludeTags: function()
  {
    return this._excludeTags.length ? this._excludeTags : this._defaultNone;
  },

  hotness: function()
  {
    var v = this.velocity();
    if (v === 0 || v === 1)
    {
      return 100;
    }
    else if (v > 0.5)
    {
      return 95;
    }
    else if (v > 0.1)
    {
      return 90;
    }
    else if (v > 0.05)
    {
      return 85;
    }
    else if (v > 0.01)
    {
      return 80;
    }
    else if (v > 0.005)
    {
      return 75;
    }
    else
    {
      return 50;
    }
  },

  markAllAsRead: function()
  {
    var last = this.tweets().models[0];
    this.lastRead(last && last.id());
    this.updateUnreadAndVelocity();
  },

  updateUnreadAndVelocity: function()
  {
    this._updateUnread();
    this.recalcVelocity(this._tweetLists._getVelocity());
  },

  recalcVelocity: function(o)
  {
    this.velocity(this.unread() ? this.tweets().length() / o.maxLength : 0);
  },

  _updateUnread: function()
  {
    var id = this.lastRead();
    var tweets = this.tweets();
    var model = tweets.findByProperty("id", id);
    var i = model ? tweets.indexOf(model) : -1;
    if (i === -1)
    {
      var models = tweets.models;
      for (i = 0, len = models.length; i < len; i++)
      {
        var oid = models[i].id();
        if (Tweet.compareTweetIds(id, oid) <= 0)
        {
          this.lastRead(oid);
          this.unread(i);
          return;
        }
      }
      this.lastRead("0");
      this.unread(len);
    }
    else
    {
      this.unread(i);
    }
  },

  remove: function()
  {
    this._removed = true;
    return this._lgrid.remove("/tweetlist/0/" + this.uuid());
  },

  _save: function()
  {
    if (!this._removed)
    {
      this._updateUnread();
      this._lgrid.write("/tweetlist/0/" + this.uuid(),
      {
        includeTags: this._includeTags,
        excludeTags: this._excludeTags,
        tweets: this.tweets().serialize().map(function(tweet) { return tweet.id_str; }),
        lastRead: this.lastRead(),
        viz: this.viz()
      });
    }
  },

  _restore: function()
  {
    return Co.Routine(this,
      function(r)
      {
        return this._lgrid.read("/tweetlist/0/" + this.uuid());
      },
      function(vals)
      {
        this.delayUpdate(function()
        {
          vals = vals() || {};

          this.viz(vals.viz || this.viz());
          var tweets = [];
          var lists = this._tweetLists;
          (vals.tweets || []).forEach(function(id)
          {
            var tweet = lists.getTweet(id);
            if (tweet)
            {
              tweets.push(tweet);
            }
          }, this);
          this.addTweets(tweets);
          this.lastRead(vals.lastRead);
          (vals.includeTags || []).forEach(function(t)
          {
            this.addIncludeTag(t.tag, false);
          }, this);
          (vals.excludeTags || []).forEach(function(t)
          {
            this.addExcludeTag(t.tag, false);
          }, this);
        });
        return true;
      }
    );
  }
});
var TweetLists = Class(
{
  constructor: function(account)
  {
    account.tweetLists = this;
    this._account = account;
    this.screenname = account.userInfo ? "@" + account.userInfo.screen_name : "@...";
    this.createDefaultList();
    this._lgrid = grid.get();

    this._types =
    {
      tweets: new IndexedModelSet({ key: "id", limit: 2000 }),
      mentions: new IndexedModelSet({ key: "id", limit: 200 }),
      dms: new IndexedModelSet({ key: "id", limit: 500 }),
      favs: new IndexedModelSet({ key: "id", limit: 500 })
    };
  },

  createDefaultList: function()
  {
    var main = new FilteredTweetsModel({ account: this._account, title: "Main", canRemove: false, name: "main", uuid: "00000000-0000-0000-0000-000000000001" });
    var photos = new FilteredTweetsModel({ account:  this._account, title: "Media", canRemove: false, uuid: "00000000-0000-0000-0000-000000000002", viz: "media" });
    var fav = new FilteredTweetsModel({ account:  this._account, title: "Favorites", canRemoved: false, uuid: "00000000-0000-0000-0000-000000000003" });
    var dms = new FilteredTweetsModel({ account:  this._account, title: "Messages", canRemoved: false, uuid: "00000000-0000-0000-0000-000000000004", viz: "stack" });
    var mentions = new FilteredTweetsModel({ account:  this._account, title: "Mentions", canRemoved: false, uuid: "00000000-0000-0000-0000-000000000005" });

    main.addIncludeTag(Tweet.TweetTag);
    main.addIncludeTag(Tweet.RetweetTag);
    main.addExcludeTag(Tweet.FavoriteTag);
    photos.addIncludeTag(Tweet.PhotoTag);
    photos.addIncludeTag(Tweet.VideoTag);
    fav.addIncludeTag(Tweet.FavoriteTag);
    dms.addIncludeTag(Tweet.DMTag);
    mentions.addIncludeTag(Tweet.MentionTag);

    this.lists = new ModelSet({
      models:
      [
        main,
        mentions,
        fav,
        dms,
        photos
      ]
    });
  },

  createList: function(name, refilter)
  {
    var list = new FilteredTweetsModel({ account: this._account, title: name, uuid: xo.Uuid.create(), canEdit: true, canRemove: true });
    if (!list.isSearch() && refilter)
    {
      this._refilter(list);
    }
    var last = list.tweets().models[0];
    list.lastRead(last && last.id());
    this.lists.append(list);
    this._save();
    list.restore(true);
    return list;
  },

  removeList: function(list)
  {
    if (list.canRemove())
    {
      this.lists.remove(list);
      list.remove();
      this._save();
    }
  },

  renameList: function(list, newName)
  {
    if (this.hasList(newName))
    {
      return false;
    }
    if (list.title() === newName)
    {
      return true;
    }
    list.title(newName);
    list._save();
    this._save();
  },

  hasList: function(name)
  {
    this.lists.forEach(function(list)
    {
      if (list.title() === name)
      {
        return true;
      }
    });
    return false;
  },

  addIncludeTag: function(list, tag)
  {
    list.addIncludeTag(tag);
    this._refilter(list);
  },

  addExcludeTag: function(list, tag)
  {
    list.addExcludeTag(tag)
  },

  removeIncludeTag: function(list, tag)
  {
    list.removeIncludeTag(tag);
    if (list.includeTags()[0].tag.key === "all")
    {
      this._refilter(list);
    }
  },

  removeExcludeTag: function(list, tag)
  {
    list.removeExcludeTag(tag);
    this._refilter(list);
  },

  changeType: function(list, type)
  {
    if (list.type(type) !== type)
    {
      this._refilter(list);
    }
  },

  changeViz: function(list, type)
  {
    list.viz(type);
  },

  _refilter: function(list)
  {
    Log.time("_refilter");
    var listtweets = list.tweets();
    listtweets.removeAll();
    if (!list.isSearch())
    {
      var tweets = [];
      for (var type in this._types)
      {
        tweets = tweets.concat(this._types[type].models);
      }
      tweets.sort(Tweet.compareTweets);
      listtweets.append(tweets);
    }
    Log.timeEnd("_refilter");
  },

  _separateTweets: function(tweets)
  {
    var all = [];
    var include = [];
    var exclude = [];
    var urls = [];
    var lastid = null;
    tweets.forEach(function(twt)
    {
      var id = twt.id_str;
      var tweet = this.getTweet(id);
      if (!tweet && id !== lastid)
      {
        lastid = id;
        tweet = new Tweet(twt, this._account, true);
        if (tweet.is_retweet())
        {
          urls = urls.concat(tweet.retweet().urls());
        }
        else
        {
          urls = urls.concat(tweet.urls());
        }
        include.push(tweet);
      }
      else
      {
        exclude.push(tweet);
      }
      all.push(tweet);
    }, this);
    return { all: all, include: include, exclude: exclude, urls: urls };
  },

  _expandTweets: function(tweets)
  {
    var include = tweets.include;
    if (!include.length)
    {
      return 0;
    }
    return Co.Routine(this,
      function()
      {
        return this._account.expandUrls(tweets.urls);
      },
      function(oembeds)
      {
        var tweetb = [];
        var mentionb = [];
        var dmb = [];

        oembeds = oembeds();
        include.forEach(function(tweet)
        {
          if (tweet.is_retweet())
          {
            tweet.retweet().oembeds(oembeds);
          }
          else
          {
            tweet.oembeds(oembeds);
          }
        });
        return include.length;
      }
    );
  },

  _addTweets: function(tweets)
  {
    var include = tweets.include;
    if (!include.length)
    {
      return 0;
    }
    return Co.Routine(this,
      function()
      {
        return this._expandTweets(tweets);
      },
      function()
      {
        var tweetb = [];
        var mentionb = [];
        var dmb = [];
        var favb = [];

        include.forEach(function(tweet)
        {
          if (tweet.isDM())
          {
            dmb.push(tweet);
          }
          else if (tweet.favorited())
          {
            favb.push(tweet);
          }
          else if (tweet.isMention())
          {
            mentionb.push(tweet);
          }
          else
          {
            tweetb.push(tweet);
          }
        });

        tweetb.length && this._types.tweets.prepend(tweetb);
        mentionb.length && this._types.mentions.prepend(mentionb);
        dmb.length && this._types.dms.prepend(dmb);
        favb.length && this._types.favs.prepend(favb);
        this._save();

        var o = this._getVelocity();
        this.lists.forEach(function(list)
        {
          if (!list.isSearch())
          {
            list.addTweets(include);
            list.recalcVelocity(o);
          }
        });

        return include.length;
      }
    );
  },

  addTweets: function(tweets)
  {
    return this._addTweets(this._separateTweets(tweets));
  },

  addSearch: function(tweets)
  {
    tweets = this._separateTweets(tweets);
    if (tweets.include.length || tweets.exclude.length)
    {
      return Co.Routine(this,
        function()
        {
          return this._expandTweets(tweets);
        },
        function()
        {
          var all = tweets.all;
          var o = this._getVelocity();
          this.lists.forEach(function(list)
          {
            if (list.isSearch())
            {
              list.addTweets(all);
              list.recalcVelocity(o);
            }
          });

          return all.length;
        }
      );
    }
    else
    {
      return 0;
    }
  },

  favTweets: function(tweets)
  {
    var tweets = this._separateTweets(tweets);
    tweets.include.forEach(function(tweet)
    {
      tweet.favorited(true);
    });
    tweets.exclude.forEach(function(tweet)
    {
      tweet.favorited(true);
      tweets.include.push(tweet);
    });
    return this._addTweets(tweets);
  },

  unfavTweets: function(tweets)
  {
    var tweets = this._separateTweets(tweets);
    tweets.exclude.forEach(function(tweet)
    {
      tweet.favorited(false);
    });
  },

  _getVelocity: function()
  {
    return {
      maxLength: 1000
    }
  },

  getTweet: function(id)
  {
    for (var type in this._types)
    {
      var tweet = this._types[type].findByProperty("id", id);
      if (tweet)
      {
        return tweet;
      }
    }
    return null;
  },

  _save: function()
  {
    var lists = [];
    this.lists.forEach(function(list)
    {
      if (list.canRemove())
      {
        lists.push({ title: list.title(), uuid: list.uuid() });
      }
    });
    var saves =
    {
      lists: lists
    };
    for (var type in this._types)
    {
      saves[type] = this._types[type].serialize();
    }
    this._lgrid.write("/tweets/0", saves);
  },

  restore: function()
  {
    var all;
    return Co.Routine(this,
      function(r)
      {
        return this._lgrid.read("/tweets/0");
      },
      function(r)
      {
        all = r() || {};
        (all.lists || []).forEach(function(listinfo)
        {
          this.lists.append(new FilteredTweetsModel({ account: this._account, title: listinfo.title, uuid: listinfo.uuid, canRemove: true }));
        }, this);

        Co.Yield(); // Let it paint
      },
      function()
      {
        var seen = {};
        for (var type in this._types)
        {
          (all[type] || []).forEach(function(tweet)
          {
            var id = tweet.id_str;
            this._types[type].append(seen[id] || (seen[id] = new Tweet(tweet, this._account, false)));
          }, this);
        }

        return Co.Foreach(this, this.lists.models,
          function(list)
          {
            return list().restore();
          }
        );
      }
    );
  }
});
var PrimaryFetcher;

var TweetFetcher = xo.Class(Events,
{
  constructor: function(account, config)
  {
    if (!KEYS.twitter)
    {
      throw new Error("Missing twitter KEYS");
    }
    this._auth = new xo.OAuthLogin(
    {
      oauth_consumer_key: KEYS.twitter.oauth_consumer_key,
      oauth_consumer_secret: KEYS.twitter.oauth_consumer_secret,
      callback: KEYS.twitter.callback,
      oauth_token: config.oauth && config.oauth.oauth_token,
      oauth_token_secret: config.oauth && config.oauth.oauth_token_secret,

      request: { POST: "https://api.twitter.com/oauth/request_token" },
      authorize: { GET: "https://api.twitter.com/oauth/authorize?force_login=true" },
      access: { POST: "https://api.twitter.com/oauth/access_token" },

      proxy: networkProxy
    });
    this._account = account;
    this._loop = null;
  },

  fetchTweets: function()
  {
    Co.Routine(this,
      function()
      {
        return this._account.userInfo || this._auth.login();
      },
      function(r)
      {
        r = r();
        if (!PrimaryFetcher)
        {
          PrimaryFetcher = this;
        }
        this.emit("login", { screen_name: r.screen_name, user_id: r.user_id });

        this.abortFetch();
        this._startFetchLoop();
      }
    );
  },

  abortFetch: function()
  {
    if (this._loop)
    {
      this._loop.terminate = true;
      this._loop.abort && this._loop.abort("terminate");
      this._loop = null;
    }
  },

  _startFetchLoop: function()
  {
    this._loop = this._runUserStreamer();
    var loop = this._loop;
    var running;
    var tweets;
    var tweetId = "1";
    var mentionId = "1";
    var favId = "1";
    var dmSendId = "1";
    var dmRecvId = "1";
    var failed;
    Co.Forever(this,
      function()
      {
        if (loop.terminated)
        {
          return Co.Break();
        }

        failed = [];
        tweets = [];

        this.emit("fetchStatus", []);
        this.emit("networkActivity", true);

        var lists = this._account.tweetLists;
        return Co.Loop(this, 4,
          function(page)
          {
            return this._ajaxWithRetry(
            {
              method: "GET",
              url: "https://api.twitter.com/1/statuses/home_timeline.json?include_entities=true&count=200&page=" + (1 + page()) + "&since_id=" + tweetId,
              auth: this._auth,
              proxy: networkProxy
            });
          },
          function(r)
          {
            var ntweets = r().json();
            tweets = tweets.concat(ntweets);
            if (!ntweets.length)
            {
              return Co.Break();
            }
            for (var i = ntweets.length - 1; i >= 0; i--)
            {
              if (lists.getTweet(ntweets[i].id_str))
              {
                return Co.Break();
              }
            }
            return true;
          }
        );
      },
      function(r)
      {
        try
        {
          r();
          if (tweets.length)
          {
            tweetId = tweets[0].id_str;
          }
        }
        catch (e)
        {
          failed.push({ op: "fetch", type: "fetch-tweet" });
          Log.exception("Tweet fetch failed", e);
        }

        return this._ajaxWithRetry(
        {
          method: "GET",
          url: "https://api.twitter.com/1/favorites.json?include_entities=true&count=200&since_id=" + favId,
          auth: this._auth,
          proxy: networkProxy
        });
      },
      function(r)
      {
        try
        {
          var json = r().json();
          if (json.length)
          {
            favId = json[0].id_str;
          }
          tweets = tweets.concat(json);
        }
        catch (e)
        {
          failed.push({ op: "fetch", type: "fetch-favorite" });
          Log.exception("Fav fetch failed", e);
        }

        return this._ajaxWithRetry(
        {
          method: "GET",
          url: "https://api.twitter.com/1/statuses/mentions.json?include_entities=true&count=200&since_id=" + mentionId,
          auth: this._auth,
          proxy: networkProxy
        });
      },
      function(r)
      {
        try
        {
          var json = r().json();
          if (json.length)
          {
            mentionId = json[0].id_str;
          }
          tweets = tweets.concat(json);
        }
        catch (e)
        {
          failed.push({ op: "fetch", type: "fetch-mention" });
          Log.exception("Mentions fetch failed", e);
        }

        return Co.Parallel(this,
          function()
          {
            return this._ajaxWithRetry(
            {
              method: "GET",
              url: "https://api.twitter.com/1/direct_messages.json?include_entities=true&count=100&since_id=" + dmRecvId,
              auth: this._auth,
              proxy: networkProxy
            });
          },
          function()
          {
            return this._ajaxWithRetry(
            {
              method: "GET",
              url: "https://api.twitter.com/1/direct_messages/sent.json?include_entities=true&count=100&since_id=" + dmSendId,
              auth: this._auth,
              proxy: networkProxy
            });
          }
        );
      },
      function(r)
      {
        try
        {
          r = r();
          var recv = r[0].json();
          var send = r[1].json();
          if (recv.length)
          {
            dmRecvId = recv[0].id_str;
          }
          if (send.length)
          {
            dmSendId = send[0].id_str;
          }
          tweets = tweets.concat(recv, send);
        }
        catch (e)
        {
          failed.push({ op: "fetch", type: "fetch-dm" });
          Log.exception("DM fetch failed", e);
        }

        this.emit("networkActivity", false);

        Log.time("TweetSort");
        tweets.sort(Tweet.compareRawTweets);
        Log.timeEnd("TweetSort");
        Log.time("TweetLoad");
        this.emit("tweets", tweets);
        Log.timeEnd("TweetLoad");

        this.emit("fetchStatus", failed);

        if (!running && !failed.length)
        {
          running = true;
          loop.run();
        }
        return Co.Sleep(failed.length === 0 ? 300 : Math.max(failed.length * 60, 120));
      }
    );
  },

  _runUserStreamer: function()
  {
    var self = this;
    var friends = null;
    var pending = "";
    var count = 0;
    var timer = null;
    var config =
    {
      method: "GET",
      url: "https://userstream.twitter.com/2/user.json",
      auth: this._auth,
      proxy: networkProxy,
      onText: function(chunk)
      {
        count += chunk.length;
        if (count > 1024 * 1024)
        {
          return this.abort("toolong");
        }
        var offset = 0;
        pending += chunk;
        var lines = pending.split("\r");
        var tweets = [];
        var favs = [];
        var unfavs = [];
        for (var i = 0, len = lines.length - 1; i < len; i++)
        {
          var line = lines[i];
          offset += line.length + 1; // length + \r
          line = line.trim();
          if (line)
          {
            try
            {
              line = JSON.parse(line);
              if (!friends)
              {
                friends = line;
              }
              else
              {
                if (line.event)
                {
                  if (line.source.screen_name === self._account.userInfo.screen_name)
                  {
                    switch (line.event)
                    {
                      case "favorite": // event, created_at, source, target, target_object
                        favs.unshift(line.target_object);
                        break;
                      case "unfavorite":
                        unfavs.unshift(line.target_object);
                        break;
                      case "follow":
                      case "unfollow":
                      default:
                        break;
                    }
                  }
                }
                else if (line.friends)
                {
                }
                else if (line["delete"])
                {
                }
                else if (line.direct_message)
                {
                  tweets.unshift(line.direct_message);
                }
                else if (line.text)
                {
                  tweets.unshift(line);
                }
              }
            }
            catch (e)
            {
              Log.exception("Bad stream data", e);
            }
          }
        }

        tweets.length && self.emit("tweets", tweets);
        favs.length && self.emit("favs", favs);
        unfavs.length && self.emit("unfavs", unfavs);

        pending = pending.substr(offset);
        if (timer)
        {
          clearTimeout(timer);
        }
        timer = setTimeout(function()
        {
          config.abort("timeout");
        }, 120000)
      },
      run: function()
      {
        Co.Forever(this,
          function()
          {
            return AjaxStream.create(config);
          },
          function(r)
          {
            var reason;
            try
            {
              reason = r().reason;
            }
            catch (e)
            {
              reason = e.reason;
            }
            switch (reason)
            {
              case "terminate":
                return Co.Break();

              case "toolong":
                Log.info("TooLong");
                return Co.Yield();

              case "timeout":
                Log.info("Timeout");
                return Co.Sleep(10);

              default:
                Log.info("Sleeping");
                return Co.Sleep(30);
            }
          }
        );
      }
    };
    return config;
  },

  fetchSearch: function(query)
  {
    this.abortSearch();
    this._searchLoop = this._runSearchStreamer([ query ]);

    var config =
    {
      method: "GET",
      url: "https://search.twitter.com/search.json?include_entities=true&rpp=100&q=" + encodeURIComponent(query),
      auth: this._auth,
      proxy: networkProxy
    };
    return Co.Routine(this,
      function()
      {
        return this._ajaxWithRetry(config);
      },
      function(r)
      {
        try
        {
          var json = r().json();
          this.emit("searches", json.results);
        }
        catch (e)
        {
          Log.exception("fetchSearch", e);
        }
        this._searchLoop.run();
        return true;
      }
    );
  },

  abortSearch: function()
  {
    if (this._searchLoop)
    {
      this._searchLoop.terminate = true;
      this._searchLoop.abort && this._searchLoop.abort("terminate");
      this._searchLoop = null;
    }
  },

  _runSearchStreamer: function(query)
  {
    var self = this;
    var pending = "";
    var count = 0;
    var timer = null;
    var config =
    {
      method: "GET",
      url: "https://stream.twitter.com/1/statuses/filter.json?track=" + query.map(encodeURIComponent).join(","),
      auth: this._auth,
      proxy: networkProxy,
      onText: function(chunk)
      {
        count += chunk.length;
        if (count > 1024 * 1024)
        {
          return this.abort("toolong");
        }
        var offset = 0;
        pending += chunk;
        var lines = pending.split("\r");
        var searches = [];
        for (var i = 0, len = lines.length - 1; i < len; i++)
        {
          var line = lines[i];
          offset += line.length + 1; // length + \r
          line = line.trim();
          if (line)
          {
            try
            {
              line = JSON.parse(line);
              if (line.text)
              {
                searches.unshift(line);
              }
            }
            catch (e)
            {
              Log.exception("Bad stream data", e);
            }
          }
        }

        searches.length && self.emit("searches", searches);

        pending = pending.substr(offset);
        if (timer)
        {
          clearTimeout(timer);
        }
        timer = setTimeout(function()
        {
          config.abort("timeout");
        }, 120000)
      },
      run: function()
      {
        Co.Forever(this,
          function()
          {
            return AjaxStream.create(config);
          },
          function(r)
          {
            var reason;
            try
            {
              reason = r().reason;
            }
            catch (e)
            {
              reason = e.reason;
            }
            switch (reason)
            {
              case "terminate":
                return Co.Break();

              case "toolong":
                Log.info("TooLong");
                return Co.Yield();

              case "timeout":
                Log.info("Timeout");
                return Co.Sleep(10);

              default:
                Log.info("Sleeping");
                return Co.Sleep(30);
            }
          }
        );
      }
    };
    return config;
  },

  tweet: function(m)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/statuses/update.json",
      auth: this._auth,
      proxy: networkProxy,
      data: "status=" + encodeURIComponent(m.text())
    });
  },

  retweet: function(id)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/statuses/retweet/" + id + ".json",
      auth: this._auth,
      proxy: networkProxy
    });
  },

  reply: function(m)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/statuses/update.json",
      auth: this._auth,
      proxy: networkProxy,
      data: "status=" + encodeURIComponent(m.text()) + "&in_reply_to_status_id=" + m.replyId()
    });
  },

  dm: function(m)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/direct_messages/new.json",
      auth: this._auth,
      proxy: networkProxy,
      data: "text=" + encodeURIComponent(m.text()) + "&screen_name=" + encodeURIComponent(m.target())
    });
  },

  favorite: function(id)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/favorites/create/" + id + ".json",
      auth: this._auth,
      proxy: networkProxy
    });
  },

  unfavorite: function(id)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/favorites/destroy/" + id + ".json",
      auth: this._auth,
      proxy: networkProxy
    });
  },

  follow: function(id)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/friendships/create.json?user_id=" + id,
      auth: this._auth,
      proxy: networkProxy
    });
  },

  unfollow: function(id)
  {
    return this._ajaxWithRetry(
    {
      method: "POST",
      url: "https://api.twitter.com/1/friendships/destroy.json?user_id=" + id,
      auth: this._auth,
      proxy: networkProxy
    });
  },

  profile: function(name, id)
  {
    var key = name ? "screen_name=" + name : "user_id=" + id;
    return Co.Routine(this,
      function()
      {
        return this._ajaxWithRetry(
        {
          method: "GET",
          url: "https://api.twitter.com/1/users/show.json?include_entities=true&" + key,
          auth: this._auth,
          proxy: networkProxy
        });
      },
      function(r)
      {
        return r().json();
      }
    );
  },

  relationship: function(name, id)
  {
    var key = name ? "target_screen_name=" + name : "target_id=" + id;
    return Co.Routine(this,
      function()
      {
        return this._ajaxWithRetry(
        {
          method: "GET",
          url: "https://api.twitter.com/1/friendships/show.json?source_id=" + this._account.userInfo.user_id + "&" + key,
          auth: this._auth,
          proxy: networkProxy
        });
      },
      function(r)
      {
        return r().json();
      }
    );
  },

  suggestions: function(slug)
  {
    return Co.Routine(this,
      function()
      {
        return this._ajaxWithRetry(
        {
          method: "GET",
          url: "https://api.twitter.com/1/users/suggestions" + (slug ? "/" + slug : "") + ".json",
          auth: this._auth,
          proxy: networkProxy
        });
      },
      function(r)
      {
        return r().json();
      }
    );
  },

  _ajaxWithRetry: function(config)
  {
    this.emit("networkActivity", true);
    var retry = 1;
    return Co.Forever(this,
      function()
      {
        return Ajax.create(config);
      },
      function(r)
      {
        try
        {
          this.emit("networkActivity", false);
          return Co.Break(r());
        }
        catch (e)
        {
          if (retry > 4)
          {
            this.emit("networkActivity", false);
            throw e;
          }
          else
          {
            Co.Sleep(retry * 0.25);
            retry <<= 1;
          }
        }
      }
    );
  }
});
var UsersAndTags = Class(
{
  constructor: function(account)
  {
    this._account = account;
    this._usersLRU = new xo.LRU(1000);
    this._tagsLRU = new xo.LRU(100);
  },

  addUser: function(screenname, name)
  {
    var val =
    {
      key: screenname.toLowerCase(),
      name: name,
      screenname: screenname
    };
    this._usersLRU.add(name.toLowerCase(), val);
    this._usersLRU.add(val.key, val);
  },

  suggestUser: function(partialName)
  {
    var seen = {};
    var matches = [];
    this._usersLRU.keys().forEach(function(key)
    {
      if (key.indexOf(partialName) === 0)
      {
        var val = this._usersLRU.get(key);
        if (!seen[val.key])
        {
          seen[val.key] = true;
          matches.push(val);
        }
      }
    }, this);
    return matches;
  },

  addHashtag: function(tag)
  {
    this._tagsLRU.add(tag, { name: tag });
  },

  suggestHashtag: function(partialTag)
  {
    var matches = [];
    this._tagsLRU.keys().forEach(function(key)
    {
      if (key.indexOf(partialTag) === 0)
      {
        matches.push(this._tagsLRU.get(key));
      }
    }, this);
    return matches;
  }
});
var Account = Class(Events,
{
  constructor: function(userInfo)
  {
    this._lgrid = grid.get();
    this.tweetLists = new TweetLists(this);
    this.errors = new Errors(this);
    this.userAndTags = new UsersAndTags(this);
  },

  open: function()
  {
    return Co.Routine(this,
      function()
      {
        return this._lgrid.read("/accounts");
      },
      function(info)
      {
        try
        {
          info = info() || [ {} ];
        }
        catch (e)
        {
          Log.exception("No account info", e);
          info = [ {} ];
        }
        this._expander = new UrlExpander();
        this._expander.on("networkActivity", function(evt, activity)
        {
          var v = RootView.getViewByName("activity");
          v.property("activity", Math.max(0, (v.property("activity") || 0) + (activity ? 1 : -1)));
        });

        info = info[0]; // First account only for now
        this.userInfo = info.userInfo
        if (this.userInfo && this.userInfo.screen_name)
        {
          this.tweetLists.screenname = "@" + this.userInfo.screen_name;
          this.emit("screenNameChange");
        }
        this._fetcher = new TweetFetcher(this, info);
        this._fetcher.on("login", function(evt, info)
        {
          this.errors.open();
          this._fetcher.on("fetchStatus", function(evt, statuses)
          {
            this.errors.remove(this.errors.find("fetch"));
            statuses.forEach(function(status)
            {
              this.errors.add(status.op, status.type, status.details);
            }, this);
          }, this);
          if (!this.userInfo || info.screen_name !== this.userInfo.screen_name || info.user_id !== this.userInfo.user_id)
          {
            this.userInfo = info;
            this.tweetLists.screenname = "@" + info.screen_name;
            this.emit("screenNameChange");
            this._lgrid.write("/accounts", this.serialize());
          }
          this.emit("opened");
        }, this);

        Topics.open();

        return this.tweetLists.restore();
      },
      function()
      {
        this._fetcher.on("tweets", function(evt, tweets)
        {
          this.tweetLists.addTweets(tweets);
        }, this);
        this._fetcher.on("searches", function(evt, tweets)
        {
          this.tweetLists.addSearch(tweets);
        }, this);
        this._fetcher.on("favs", function(evt, tweets)
        {
          this.tweetLists.favTweets(tweets);
        }, this);
        this._fetcher.on("unfavs", function(evt, tweets)
        {
          this.tweetLists.unfavTweets(tweets);
        }, this);
        this._fetcher.on("networkActivity", function(evt, activity)
        {
          var v = RootView.getViewByName("activity");
          v.property("activity", Math.max(0, (v.property("activity") || 0) + (activity ? 1 : -1)));
        }, this);

        var self = this;
        function online()
        {
          self._fetcher.abortFetch();
          self._fetcher.abortSearch();
          self.fetch();
        }
        function offline()
        {
          self._fetcher.abortFetch();
          self._fetcher.abortSearch();
        }
        document.addEventListener("online", online);
        document.addEventListener("offline", offline);
        document.addEventListener("resume", online);
        document.addEventListener("pause", offline);
        this.fetch();

        return true;
      }
    );
  },

  expandUrls: function(urls)
  {
    return this._expander.expand(urls);
  },

  fetch: function()
  {
    this.errors.remove(this.errors.find("fetch"));
    this._fetcher.fetchTweets();
  },

  tweet: function(tweet)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.tweet(tweet);
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("tweet", "tweet", tweet);
        }
      }
    );
  },

  retweet: function(tweet)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.retweet(tweet.id());
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("retweet", "retweet", tweet);
          return null;
        }
      }
    );
  },

  reply: function(tweet)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.reply(tweet);
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("reply", "reply", tweet);
          return null;
        }
      }
    );
  },

  dm: function(tweet)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.dm(tweet);
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("dm", "dm", tweet);
          return null;
        }
      }
    );
  },

  favorite: function(tweet)
  {
    this.tweetLists.favTweets([ tweet.serialize() ]);
    return Co.Routine(this,
      function()
      {
        return this._fetcher.favorite(tweet.id());
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("favorite", "favorite", tweet);
          return null;
        }
      }
    );
  },

  unfavorite: function(tweet)
  {
    this.tweetLists.unfavTweets([ tweet.serialize() ]);
    return Co.Routine(this,
      function()
      {
        return this._fetcher.unfavorite(tweet.id());
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("unfavorite", "unfavorite", tweet);
          return null;
        }
      }
    );
  },
  
  follow: function(user)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.follow(user.id());
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("follow", "follow", user);
          return null;
        }
      }
    );
  },

  unfollow: function(user)
  {
    return Co.Routine(this,
      function()
      {
        return this._fetcher.unfollow(user.id());
      },
      function(r)
      {
        try
        {
          return r();
        }
        catch (e)
        {
          this.errors.add("unfollow", "unfollow", user);
          return null;
        }
      }
    );
  },

  search: function(query)
  {
    return this._fetcher.fetchSearch(query);
  },

  serialize: function()
  {
    return [{
      version: 1,
      oauth: this._fetcher._auth.serialize(),
      userInfo: this.userInfo
    }];
  }
});
var Errors = Model.create(
{
  constructor: function(__super, account)
  {
    __super();
    this._lgrid = grid.get();
    this._running = false;
    this._account = account;
    this._errors = [];
  },

  open: function()
  {
    Co.Routine(this,
      function()
      {
        return this._restore();
      },
      function()
      {
        return this._retry();
      },
      function()
      {
        this._runq();
      }
    );
  },

  errors: function()
  {
    return this._errors;
  },

  error: function()
  {
    return this._errors.length;
  },

  add: function(op, type, details)
  {
    this._add({ op: op, type: type || "none", details: details || {} });
    this._runq();
  },

  _add: function(error)
  {
    this._errors.push(error);
    this._save();
  },

  remove: function(errors)
  {
    var change = false;
    errors.forEach(function(error)
    {
      var idx = this._errors.indexOf(error);
      if (idx !== -1)
      {
        this._errors.splice(idx, 1);
        change = true;
      }
    }, this);
    this.emit("update");
    change && this._save();
    return change;
  },

  find: function(op)
  {
    var results = [];
    this._errors.forEach(function(error)
    {
      if (error.op === op)
      {
        results.push(error);
      }
    });
    return results;
  },

  _runq: function()
  {
    this.emit("update");
    if (!this._running && this._errors.length)
    {
      this._running = true;
      Co.Forever(this,
        function()
        {
          Co.Sleep(60);
        },
        function()
        {
          return this._retry();
        },
        function(r)
        {
          if (!this._errors.length)
          {
            this._running = false;
            return Co.Break();
          }
          else
          {
            return true;
          }
        }
      );
    }
  },

  _retry: function()
  {
    if (this._errors.length)
    {
      return Co.Routine(this,
        function()
        {
          var errors = this._errors;
          this._errors = [];
          this.emit("update");
          return Co.Loop(this, errors.length,
            function(idx)
            {
              var error = errors[idx()];
              if (error.op === "fetch")
              {
                // Tweet fetching retry is handled by the fetch logic.
                this._errors.push(error);
                return true;
              }
              else
              {
                return this._account[error.op](error.details);
              }
            }
          );
        },
        function(r)
        {
          try
          {
            r();
          }
          catch (e)
          {
            Log.exception("Errors._runq", e);
          }
          this._save();
          this.emit("update");
          return true;
        }
      );
    }
    else
    {
      return false;
    }
  },

  _save: function()
  {
    try
    {
      this._lgrid.write("/errors", this._errors.map(function(error)
      {
        return { op: error.op, type: error.type, details: error.details ? error.details.serialize() : null };
      }));
    }
    catch (e)
    {
      Log.exception("Error save failed", e);
    }
  },

  _restore: function()
  {
    return Co.Routine(this,
      function()
      {
        return this._lgrid.read("/errors");
      },
      function(r)
      {
        (r() || []).forEach(function(error)
        {
          switch (error.op)
          {
            // Discard any saved fetch - we'll do that anyway
            case "fetch":
              break;

            // Retweets are real tweet objects
            case "retweet":
              error.details = new Tweet(error.details, this._account, false);
              this._add(error);
              break;

            // Everything else is a tweetbox model
            default:
              error.details = new NewTweetModel(error.details);
              this._add(error);
              break;
          }
        }, this);
        return true;
      }
    );
  }
});
var UrlExpander = Class(Events,
{
  // Service to expand urls
  _serviceUrl: "https://api.twitter.com/1/urls/resolve.json?",
  _batchSize: 50,

  expand: function(urls)
  {
    var results = {};
    return Co.Routine(this,
      function()
      {
        this.emit("networkActivity", true);
        var batches = [];
        for (var i = 0, len = urls.length; i < len; i += this._batchSize)
        {
          batches.push(urls.slice(i, i + this._batchSize));
        }
        return Co.Foreach(this, batches,
          function(batch)
          {
            return Ajax.create(
            {
              method: "GET",
              url: this._serviceUrl + batch().map(function(url)
              {
                return "urls%5B%5D=" + escape(url)
              }).join("&"),
              headers: KEYS.twitterResolve,
              proxy: networkProxy
            });
          },
          function(r)
          {
            try
            {
              var json = r().json();
              for (var url in json)
              {
                results[url] = this._expanders(json[url]);
              }
            }
            catch (e)
            {
              Log.exception("UrlExpander failed", e);
            }
            return true;
          }
        );
      },
      function()
      {
        this.emit("networkActivity", false);
        return results;
      }
    );
  },

  _expanders: function(url)
  {
    // Instagram
    if (url.indexOf("http://instagr.am/p/") === 0)
    {
      return {
        url: url + "/media?size=m",
        media_url: url + "/media?size=l",
        type: "photo"
      };
    }
    // YouTube - No YouTube for now because iframes mess up the touch scolling in iOS 5.1 :-(
    /* else if (url.indexOf("http://www.youtube.com/watch?v=") === 0)
    {
      var v = new xo.Url(url).getParameter("v");
      return {
        url: url,
        type: "video",
        html: '<iframe width="350" height="262" src="http://www.youtube.com/embed/' + v + '?rel=0" frameborder="0" allowfullscreen></iframe>',
        html_large: '<iframe width="640" height="360" src="http://www.youtube.com/embed/' + v + '?rel=0" frameborder="0" allowfullscreen></iframe>'
      }
    } */
    // YouTube - picture only
    else if (url.indexOf("http://www.youtube.com/watch?v=") === 0)
    {
      var v = new xo.Url(url).getParameter("v");
      return {
        url: url,
        media_url: "http://img.youtube.com/vi/" + v + "/0.jpg",
        type: "video"
      }
    }
    // Twitpic
    else if (url.indexOf("http://twitpic.com/") === 0)
    {
      return {
        url: url,
        media_url: "http://twitpic.com/show/large/" + new xo.Url(url).pathname,
        type: "photo"
      };
    }
    // YFrog
    else if (url.indexOf("http://yfrog.com/") === 0)
    {
      return {
        url: url + ":iphone",
        media_url: url + ":medium",
        type: "photo"
      };
    }
    else
    {
      return {
        url: url
      };
    }
  }
});
var Composite =
{
  _cache: {},

  mergeIcons: function(topUrl, bottomUrl, csize, isize, corner)
  {
    var key = topUrl + ":" + bottomUrl + ":" + csize + ":" + isize;
    var val = this._cache[key];
    if (val)
    {
      return val;
    }
    return Co.Routine(this,
      function()
      {
        return Co.Parallel(this,
          function()
          {
            return this._loadImg(topUrl);
          },
          function()
          {
            return this._loadImg(bottomUrl);
          }
        );
      },
      function(imgs)
      {
        try
        {
          imgs = imgs();
          var canvas = document.createElement("canvas");
          canvas.width = csize;
          canvas.height = csize;
          var diff = csize - isize;
          var ctx = canvas.getContext("2d");
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(corner, 0);
          ctx.lineTo(isize - corner, 0);
          ctx.arcTo(isize, 0, isize, corner, corner);
          ctx.lineTo(isize, isize - corner);
          ctx.arcTo(isize, isize, isize - corner, isize, corner);
          ctx.lineTo(corner, isize);
          ctx.arcTo(0, isize, 0, isize - corner, corner);
          ctx.lineTo(0, corner);
          ctx.arcTo(0, 0, corner, 0, corner);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(imgs[0], 0, 0, isize, isize);
          ctx.restore();
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(diff + corner, diff);
          ctx.lineTo(diff + isize - corner, diff);
          ctx.arcTo(diff + isize, diff, diff + isize, diff + corner, corner);
          ctx.lineTo(diff + isize, diff + isize - corner);
          ctx.arcTo(diff + isize, diff + isize, diff + isize - corner, diff + isize, corner);
          ctx.lineTo(diff + corner, diff + isize);
          ctx.arcTo(diff, diff + isize, diff, diff + isize - corner, corner);
          ctx.lineTo(diff, diff + corner);
          ctx.arcTo(diff, diff, diff + corner, diff, corner);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(imgs[1], diff, diff, isize, isize);
          ctx.restore();
          this._cache[key] = canvas.toDataURL("image/png");
          return this._cache[key];
        }
        catch (_)
        {
          return "";
        }
      }
    );
  },

  _loadImg: function(url)
  {
    return Co.Routine(this,
      function()
      {
        var i = document.createElement("img");
        i.src = networkProxy ? networkProxy + escape(url) : url;
        if (i.complete)
        {
          return i;
        }
        else
        {
          i.onload = Co.Callback(this, function()
          {
            return i;
          });
          i.onerror = Co.Callback(this, function()
          {
            throw new Error("Image load failed: " + url);
          });
        }
      }
    );
  }
};
var NewTweetModel = Model.create(
{
  _split: /(https?:\/\/\S*)/, // Need a better pattern

  text: Model.Property,
  replyId: Model.Property,
  screen_name: Model.Property,
  target: Model.Property,
  count: function()
  {
    var count = 140;
    this.text().split(this._split).forEach(function(txt, idx)
    {
      if (idx % 2 === 1)
      {
        if (txt.slice(0, 5) === "https")
        {
          count -= Math.min(txt.length, 21);
        }
        else
        {
          count -= Math.min(txt.length, 20);
        }
      }
      else
      {
        count -= txt.length;
      }
    });
    return count;
  }
});

var TweetBox = Class(
{
  open: function(account, type, tweet)
  {
    if (tweet && tweet.is_retweet())
    {
      tweet = tweet.retweet();
    }
    var text = type === "reply" ? tweet.at_screen_name() : type === "retweet" ? tweet.text() : "";
    var send = new NewTweetModel(
    {
      text: text,
      replyId: tweet && tweet.id(),
      screen_name: tweet && tweet.conversation(),
      target: tweet && tweet.conversation()
    });
    var target = null;
    var mv = new ModalView(
    {
      node: document.getElementById("root-dialog"),
      template: __resources.tweet_dialog,
      partials: __resources,
      model: send,
      clickToClose: false,
      properties:
      {
        isEdit: type !== "retweet",
        isReply: type === "reply",
        isRetweet: type === "retweet",
        isTweet: type === "tweet",
        isDM: type === "dm"
      },
      controller:
      {
        onEdit: function(m, v)
        {
          v.update(
          {
            isRetweet: false,
            isTweet: true,
            isEdit: true
          });
          m.text('RT @' + (tweet.is_retweet() ? tweet.retweet().screen_name() : tweet.screen_name()) + ': ' + m.text());
        },
        onTweetButton: function(m, v)
        {
          Log.metric("tweet", type === "retweet" ? "comment" : type);
          account.tweet(m);
          v.close();
        },
        onRetweetButton: function(m, v)
        {
          Log.metric("tweet", "retweet");
          account.retweet(tweet);
          v.close();
        },
        onReplyButton: function(m, v)
        {
          Log.metric("tweet", "reply");
          account.reply(m);
          v.close();
        },
        onDMButton: function(m, v)
        {
          Log.metric("tweet", "dm");
          account.dm(m);
          v.close();
        },
        onCancelButton: function(m, v)
        {
          v.close();
        },
        onInput: function(m, v, e)
        {
          var value = e.target.value;
          var curpos = e.target.selectionStart;
          var start;
          wordStart: for (start = curpos - 1; start > 0; start--)
          {
            switch (value[start])
            {
              case " ":
              case "\n":
                start++;
                break wordStart;
              default:
                break;
            }
          }
          var len = value.length;
          var end;
          wordEnd: for (end = start; end < len; end++)
          {
            switch (value[end])
            {
              case " ":
              case "\n":
                break wordEnd;
              default:
                break;
            }
          }
          if (end > start + 1)
          {
            var word = value.slice(start + 1, end).toLowerCase();
            switch (value[start])
            {
              case "@":
                mv.property("usuggestions", account.userAndTags.suggestUser(word).slice(0, 10));
                target =
                {
                  textarea: e.target,
                  start: start,
                  end: end,
                  type: "@"
                };
                break;
              case "#":
                mv.property("hsuggestions", account.userAndTags.suggestHashtag(word).slice(0, 10));
                target =
                {
                  textarea: e.target,
                  start: start,
                  end: end,
                  type: "#"
                };
                break;
              default:
                mv.property("usuggestions", null);
                mv.property("hsuggestions", null);
                target = null;
                break;
            }
          }
          else
          {
            mv.property("usuggestions", null);
            mv.property("hsuggestions", null);
            target = null;
          }

          m[e.target.name](e.target.value);
        },
        onSuggestion: function(m)
        {
          if (target)
          {
            var value = target.textarea.value;
            var name = m.screenname || m.name;
            value = value.slice(0, target.start) + target.type + name + (value.slice(target.end) || " ");
            target.textarea.value = value;
            send.text(value);
            var cur = target.start + name.length + 2;
            target.textarea.selectionStart = cur;
            target.textarea.selectionEnd = cur;
            mv.property("usuggestions", null);
            mv.property("hsuggestions", null);
            target = null;
          }
        }
      }
    });
    if (type === "reply")
    {
      send.on("update.text", function fn()
      {
        if (send.text()[0] !== "@")
        {
          send.removeEventListener("update.text", fn);
          mv.update(
          {
            isReply: false,
            isTweet: true
          });
        }
      });
    }
    if (text)
    {
      var ta = mv.node().querySelector("textarea");
      ta.selectionStart = ta.selectionEnd = text.length;
    }
  }
});
var dbinfo =
{
  name: "storage",
  size: 5 * 1024 * 1024,
  table: "appstore"
};

var StorageGridProvider = Environment.isPhoneGap() ? xo.SQLStorageGridProvider : xo.LocalStorageGridProvider;

new StorageGridProvider(
  grid.get(),
  /^\/accounts$/,
  function()
  {
    return "accounts_accountInfo";
  },
  dbinfo
);
new StorageGridProvider(
  grid.get(),
  /^\/tweetlist\/(.*)\/(.*)$/,
  function(selector, path)
  {
    var p = selector.exec(path);
    return "accounts_tweets_" + p[1] + "_" + p[2];
  },
  dbinfo
);
new StorageGridProvider(
  grid.get(),
  /^\/topics$/,
  function(selector, path)
  {
    return "accounts_topics";
  },
  dbinfo
);
new StorageGridProvider(
  grid.get(),
  /^\/errors$/,
  function()
  {
    return "accounts_errors";
  },
  dbinfo
);
new StorageGridProvider(
  grid.get(),
  /^\/tweets\/(.*)$/,
  function(selector, path)
  {
    return "accounts_alltweets_" + selector.exec(path)[1];
  },
  dbinfo
);
(function()
{
  var ReadabilityModel = Model.create(
  {
    title: Model.Property,
    text: Model.Property
  });

  var lgrid = grid.get({ lru: 5 });
  var selector = /^\/readable=(.*)$/;
  var pending = null;
  var stage = document.createElement("div");


  lgrid.watch(selector, function(op, path)
  {
    if (op == xo.Grid.READ)
    {
      var url = selector.exec(path)[1];

      var model = new ReadabilityModel();
      lgrid.write(path, model);

      Co.Routine(this,
        function()
        {
          if (pending)
          {
            pending.abort();
            lgrid.remove(pending._gridPath);
          }
          pending =
          {
            method: "POST",
            url: "http://www.readability.com/articles/queue",
            data: "url=" + url,
            proxy: networkProxy,
            _gridPath: path
          };
          return Ajax.create(pending);
        },
        function(r)
        {
          try
          {
            pending = null;
            stage.innerHTML = r().text();
            model.delayUpdate(function()
            {
              this.title(stage.querySelector("#article-entry-title,#rdb-article-title").innerHTML);
              this.text(stage.querySelector("#rdb-article-content").innerHTML);
            });
          }
          catch (e)
          {
            Log.exception("Readability failure", e);
            model.delayUpdate(function()
            {
              this.title("Failed");
              this.text(url);
            });
            lgrid.remove(path);
          }
        }
      );
    }
  });
})();
(function()
{
  var Profile = Model.create(
  {
    id: Model.Property("id_str"),
    screen_name: Model.Property,
    name: Model.Property,
    description: Model.Property,
    location: Model.Property,
    url: Model.Property,
    verified: Model.Property,

    profile_background_tile: Model.Property,
    profile_image_url: function()
    {
      if (!this._profile_image_url)
      {
        this._profile_image_url = "http://api.twitter.com/1/users/profile_image/" + this.screen_name() + Tweet.profileImgExt;
      }
      return this._profile_image_url;
    },
    profile_background_image_url: Model.Property,
    profile_background_color: Model.Property,
    profile_banner_url: Model.Property,

    followers_count: Model.Property,
    friends_count: Model.Property,
    tweet_count: Model.Property("statuses_count"),
    followed_by: Model.Property("relationship.target.followed_by"),

    constructor: function(__super, screenName)
    {
      __super(
      {
        id_str: 0,
        screen_name: screenName,
        name: "",
        description: "",
        location: "",
        url: "",
        verified: false,
        followers_count: "",
        friends_count: "",
        statuses_count: "",
        relationship:
        {
          target:
          {
            followed_by: false
          }
        }
      });
    }
  });

  var lgrid = grid.get();
  var nameSelector = /^\/twitter\/profile\/screenName=(.*)$/;

  function getProfile(name)
  {
    var p = new Profile(name);
    if (name)
    {
      lgrid.write("/twitter/profile/screenName=" + name.toLowerCase(), p);
    }
    Co.Routine(this,
      function()
      {
        return Co.Parallel(this,
          function()
          {
            return PrimaryFetcher.profile(name);
          },
          function()
          {
            return PrimaryFetcher.relationship(name);
          }
        );
      },
      function(info)
      {
        info = info();
        info[0].relationship = info[1].relationship;
        info = info[0];
        p.delayUpdate(function()
        {
          [ "screen_name", "name", "description", "location", "url", "verified", "profile_background_tile", "profile_background_image_url", "profile_background_color", "profile_banner_url", "followers_count", "friends_count" ].forEach(function(name)
          {
            p[name](info[name]);
          });
          p.id(info.id_str);
          p.tweet_count(info.statuses_count)
          p.followed_by(info.relationship.target.followed_by);
        });
        lgrid.write("/twitter/profile/screenName=" + p.screen_name().toLowerCase(), p);
      }
    );
  }

  lgrid.watch(nameSelector, function(op, path)
  {
    if (op === xo.Grid.READ)
    {
      getProfile(nameSelector.exec(path)[1]);
    }
  });
})();
var Topics = {};

(function()
{
  var refreshTimeout = 1000 * 60 * 60 * 24;
  var name2topic = {};
  var lastupdate = 0;
  var lgrid = grid.get();

  Topics.lookupByScreenName = function(name)
  {
    return name2topic[name] || [];
  };

  Topics.open = function()
  {
    Co.Routine(this,
      function()
      {
        return lgrid.read("/topics");
      },
      function(data)
      {
        data = data() || {};
        name2topic = data.name2topic || [];
        lastupdate = data.lastupdate || 0;

        if (Date.now() - lastupdate > refreshTimeout)
        {
          return Co.Routine(this,
            function()
            {
              return Co.Forever(this,
                function()
                {
                  return PrimaryFetcher ? Co.Break() : Co.Sleep(10);
                }
              );
            },
            function()
            {
              return PrimaryFetcher.suggestions();
            },
            function(r)
            {
              return Co.Foreach(this, r(),
                function(suggestion)
                {
                  return PrimaryFetcher.suggestions(suggestion().slug);
                }
              );
            },
            function(s)
            {
              var hash = {};
              s().forEach(function(suggestion)
              {
                var name = suggestion.name;
                suggestion.users.forEach(function(user)
                {
                  var screenname = "@" + user.screen_name.toLowerCase();
                  (hash[screenname] || (hash[screenname] = [])).push({ title: name });
                });
              });
              name2topic = hash;
              lastupdate = Date.now();
              lgrid.write("/topics",
              {
                name2topic: name2topic,
                lastupdate: lastupdate
              });
            }
          );
        }
      }
    );
  }
})();
var TweetController = xo.Controller.create(
{
  constructor: function(__super)
  {
    __super();
    this.lgrid = grid.get();
  },

  metrics:
  {
    category: "tweet"
  },

  onUrl: function(m, v, e)
  {
    this.metric("url:open");
    var url = e.target.dataset.href;

    Co.Routine(this,
      function()
      {
        return this.lgrid.read("/readable=" + url);
      },
      function(readModel)
      {
        readModel = readModel();

        var pagenr = 0;
        var maxpagenr = 0;
        var mv = new ModalView(
        {
          node: document.getElementById("root-dialog"),
          template: __resources.readability,
          partials: __resources,
          model: readModel,
          properties:
          {
            pages: 0,
            pagenr: 0,
            translate: ""
          },
          controller: new (xo.Controller.create(
          {
            metrics:
            {
              category: "readability"
            },
            onForward: function()
            {
              Co.Routine(this,
                function()
                {
                  var r = document.querySelector("#readability-scroller .text");
                  pagenr = Math.min(maxpagenr - 1, mv.pagenr() + 1);
                  mv.translate("-webkit-transform: translate3d(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0,1px)");
                  Co.Sleep(0.2);
                },
                function()
                {
                  mv.pagenr(pagenr);
                  this.metric("page:forward", pagenr);
                }
              );
            },
            onBackward: function()
            {
              Co.Routine(this,
                function()
                {
                  var r = document.querySelector("#readability-scroller .text");
                  pagenr = Math.max(0, mv.pagenr() - 1);
                  mv.translate("-webkit-transform: translate3d(-" + pagenr * (r.offsetWidth + parseInt(getComputedStyle(r).WebkitColumnGap)) + "px,0,1px)");
                  Co.Sleep(0.2);
                },
                function()
                {
                  mv.pagenr(pagenr);
                  this.metric("page:backward", pagenr);
                }
              );
            },
            onOpenWeb: function()
            {
              var browser = ChildBrowser.install();
              browser.onClose = function()
              {
                mv.close();
              };
              browser.showWebPage(url);
              this.metric("browser:open");
            },
            onOrientationChange: function()
            {
              readModel.emit("update");
            },
            onClose: function()
            {
              this.metric("close");
            }
          }))
        });
        mv.addListener(mv.node(), "click", function(e)
        {
          e.preventDefault();
        });
        readModel.on("update", function()
        {
          Co.Routine(this,
            function()
            {
              Co.Yield();
            },
            function()
            {
              var r = document.querySelector("#readability-scroller .text");
              var gap = parseInt(getComputedStyle(r).WebkitColumnGap);
              var images = r.querySelectorAll("img");
              function recalc()
              {
                maxpagenr = Math.ceil((r.scrollWidth + gap) / (r.offsetWidth + gap));
                mv.pages(Math.min(10, maxpagenr));
              }
              function hide()
              {
                this.parentNode.removeChild(this);
                recalc();
              }
              for (var i = 0; i < images.length; i++)
              {
                var img = images[i];
                img.onload = recalc;
                img.onerror = hide;
                if (img.complete && img.naturalHeight === 0 && img.naturalWidth === 0)
                {
                  img.onerror();
                }
              }
              recalc();
              mv.translate("-webkit-transform: translate3d(0,0,1px)");
              mv.pagenr(0);
            }
          );
        }, this);
        // Force layout if we have text already (cached)
        if (readModel.text())
        {
          readModel.emit("update");
        }
      }
    );
  },

  onImage: function(m, _, e, models)
  {
    this.metric("image:open");

    var url = e.target.dataset.href;
    var furl = e.target.dataset.fullHref || url;

    if (furl.indexOf("http://www.youtube.com/watch") === 0 || furl.indexOf("http://youtube.com/watch") === 0)
    {
      // Open Safari
      location = furl;
      return;
    }
    new ModalView(
    {
      node: document.getElementById("root-dialog"),
      template: __resources.imageview,
      partials: __resources,
      model:
      {
        url: url,
        tweet: models.current_list().viz() === "media" ? m : null,
        account: function()
        {
          return models.account();
        }
      },
      controller: this
    });
  },

  onVideo: function(_, _, e)
  {
    this.metric("video:open");
    new ModalView(
    {
      node: document.getElementById("root-dialog"),
      template: __resources.videoview,
      partials: __resources,
      model:
      {
        embed: unescape(e.target.dataset.embed)
      }
    });
  },

  onToggleFavorite: function(m, _, _, models)
  {
    this.metric(m.favorited() ? "unfav" : "fav");
    if (m.favorited())
    {
      models.account().unfavorite(m);
    }
    else
    {
      models.account().favorite(m);
    }
  },

  onSendRetweet: function(tweet, _, _, models)
  {
    this.metric("retweet:compose");
    new TweetBox().open(models.account(), "retweet", tweet);
  },

  onSendReply: function(tweet, _, _, models)
  {
    this.metric("reply:compose");
    new TweetBox().open(models.account(), "reply", tweet);
  },

  onSendDM: function(tweet, _, _, models)
  {
    this.metric("dm:compose");
    new TweetBox().open(models.account(), "dm", tweet);
  },

  onMention: function(_, _, e, models)
  {
    this.metric("mention:open");
    var screenName = e.target.dataset.name.slice(1).toLowerCase();
    Co.Routine(this,
      function()
      {
        return this.lgrid.read("/twitter/profile/screenName=" + screenName);
      },
      function(p)
      {
        this._openProfileDialog(p(), models);
      }
    );
  },

  onProfilePic: function(tweet, _, _, models)
  {
    this.metric("profile_pic:open");
    Co.Routine(this,
      function()
      {
        if (tweet.is_retweet())
        {
          tweet = tweet.retweet();
        }
        return this.lgrid.read("/twitter/profile/screenName=" + tweet.screen_name().toLowerCase());
      },
      function(p)
      {
        this._openProfileDialog(p(), models);
      }
    );
  },

  onOpenTweet: function(_, v, e)
  {
    var nested = v.node().querySelector(".nested-tweets");
    var open = v.property("tweet_open");
    if (open)
    {
      this.metric("nested:open");
      Co.Routine(this,
        function()
        {
          nested.style.height = 0;
          Co.Sleep(0.5);
        },
        function()
        {
          v.tweet_open(false);
        }
      );
    }
    else
    {
      this.metric("nested:close");
      Co.Routine(this,
        function()
        {
          nested.style.height = 0;
          v.tweet_open(true);
          Co.Yield();
        },
        function()
        {
          nested.style.height = (20 + nested.scrollHeight) + "px";
        }
      );
    }
  },

  _openProfileDialog: function(profile, models)
  {
    new ModalView(
    {
      node: document.getElementById("root-dialog"),
      template: __resources.tweet_profile,
      partials: __resources,
      model: profile,
      controller: new (xo.Controller.create(
      {
        metrics:
        {
          category: "profile_dialog"
        },
        onFollow: function()
        {
          this.metric("follow");
          profile.followed_by(true);
          models.account().follow(profile);
        },
        onUnfollow: function()
        {
          this.metric("unfollow");
          profile.followed_by(false);
          models.account().unfollow(profile);
        }
      }))
    });
  }
});
var ListController = xo.Controller.create(
{
  constructor: function(__super)
  {
    __super();
    var self = this;
    document.addEventListener("click", function()
    {
      self._editList(null, null);
    });
  },

  metrics:
  {
    category: "lists"
  },

  onSelectList: function(m, v, _, models)
  {
    if (models.current_list() === m)
    {
      RootView.getViewByName("tweets").scrollToTop();
    }

    models.filter("");
    document.getElementById("filter").value = "";
    RootView.getViewByName("tweets").filterText("");

    PrimaryFetcher && PrimaryFetcher.abortSearch();

    models.current_list(m);
    m.markAllAsRead();
    this._editList(null, null);
    if (!this._selectedListView)
    {
      this._selectedListView = RootView.getViewByName("main");
    }
    if (this._selectedListView)
    {
      this._selectedListView.property("selected", false);
      this._selectedListView = null;
    }
    this._selectedListView = v;
    this._selectedListView.property("selected", true);

    var query = m.asSearch();
    if (query)
    {
      this.metric("select:search");
      models.account().search(query);
    }
    else
    {
      this.metric("select:list");
    }
  },

  onDropToList: function(m, v, _, models)
  {
    this.metric("include:add_to_other")
    models.account().tweetLists.addIncludeTag(m, v.dropped());
  },

  onDropToNewList: function(m, v, _, models)
  {
    this.metric("new:drop");
    var listName = v.dropped().title;
    switch (v.dropped().type)
    {
      case "hashtag":
      case "somewhere":
        listName += "?";
        break;
      default:
        break;
    }
    var list = models.account().tweetLists.createList(listName, false);
    if (list && !list.isSearch())
    {
      models.account().tweetLists.addIncludeTag(list, v.dropped());
    }
  },

  onNewList: function(m, v, e, models)
  {
    this.metric("new:type");
    var listName = e.target.value;
    if (listName)
    {
      models.account().tweetLists.createList(listName, true);
    }
    e.target.value = "";
  },

  onEditList: function(_, v, _, models)
  {
    this.metric("edit");
    this._editList(v, models);
  },

  onRemoveList: function(_, _, _, models)
  {
    this.metric("remove");
    models.account().tweetLists.removeList(models.current_list());
    this._editList(null, null);
    models.current_list(models.account().tweetLists.lists.models[0]);
    this._selectedListView = RootView.getViewByName("main");
    this._selectedListView.property("selected", true);
  },

  onDropInclude: function(_, v, _, models)
  {
    this.metric("include:add");
    models.account().tweetLists.addIncludeTag(models.current_list(), v.dropped());
  },

  onDropExclude: function(_, v, _, models)
  {
    this.metric("exclude:add");
    models.account().tweetLists.addExcludeTag(models.current_list(), v.dropped());
  },

  onKillInclude: function(m, _, _, models)
  {
    if (this._editView && this._editView.property("editMode"))
    {
      this.metric("include:remove");
      models.account().tweetLists.removeIncludeTag(models.current_list(), m);
    }
  },

  onKillExclude: function(m, _, _, models)
  {
    if (this._editView && this._editView.property("editMode"))
    {
      this.metric("exclude:remove");
      models.account().tweetLists.removeExcludeTag(models.current_list(), m);
    }
  },

  onChangeViz: function(_, _, e, models)
  {
    this.metric("viz:change");
    models.account().tweetLists.changeViz(models.current_list(), e.target.value);
  },

  _editList: function(v, models)
  {
    if (this._editView)
    {
      this._editModels.account().tweetLists._save();
      this._editModels.current_list()._save();
      this._editView.property("editMode", false);
      this._editView = null;
      this._editModels = null;
    }
    if (v)
    {
      this._editView = v;
      this._editView.property("editMode", true);
      this._editModels = models;
    }
  }
});
var FilterController = xo.Controller.create(
{
  metrics:
  {
    category: "filter"
  },
  onFilter: function(_, _, e)
  {
    this.metric("type");
    this._filterInput = e.target;
    RootView.getViewByName("tweets").filterText(this._filterInput.value.toLowerCase());
  },
  onDropFilter: function(_, v, e, models)
  {
    this.metric("drop");
    this._filterInput = e.target;
    var key = v.dropped().key;
    models.filter(key);
    this._filterInput.value = key;
    RootView.getViewByName("tweets").filterText(key);
  },
  onFilterClear: function(_, _, _, models)
  {
    this.metric("clear");
    this._filterInput && (this._filterInput.value = "");
    models.filter("");
    RootView.getViewByName("tweets").filterText("");
    models.current_list().markAllAsRead();
  }
});
var GlobalController = xo.Controller.create(
{
  metrics:
  {
    category: "global"
  },

  onComposeTweet: function(_, _, _, models)
  {
    this.metric("tweet:compose");
    new TweetBox().open(models.account(), "tweet");
  },

  onComposeDM: function(_, _, _, models)
  {
    this.metric("dm:compose");
    new TweetBox().open(models.account(), "dm");
  },

  onInsertAtTop: function(_, _, _, models)
  {
    models.current_list().markAllAsRead();
  }
});
var AccountController = xo.Controller.create(
{
  metrics:
  {
    category: "account"
  },

  onToggleShow: function(_, _, _, _, root)
  {
    this.metric(root.open() ? "hide" : "show");
    root.open(!root.open());
  },

  onOpenErrors: function(_, _, _, models)
  {
    this.metric("errors:open");
    new ModalView(
    {
      node: document.getElementById("root-dialog"),
      template: __resources.error_dialog,
      partials: __resources,
      model: models.account().errors,
      controller:
      {
        onRemoveError: function(m)
        {
          if (m.op !== "fetch")
          {
            models.account().errors.remove([ m ]);
          }
        }
      }
    });
  },
});var __resources = {
'basic_tweet': '{{#_ View}}\
<div class="tweet"{{#has_children}} data-action-click="OpenTweet"{{/has_children}}>\
  {{#retweet}}\
    <img class="icon" src={{profile_image_url}} data-action-click="ProfilePic">\
    <div class="body">\
      <span class="fullname">{{name}}</span> <span class="screenname">@{{screen_name}}</span><span class="timestamp" data-timestamp="{{created_at}}">{{created_since}}</span>\
      <div class="text">{{{entifiedText}}}</div>\
      {{#include_media}}\
        {{#embed_photo_url}}\
          <img class="photo" data-action-click="Image" data-href="{{embed_photo_url}}" src="{{embed_photo_url_small}}">\
        {{/embed_photo_url}}\
      {{/include_media}}\
    </div>\
  {{/retweet}}\
  {{^retweet}}\
    <img class="icon" src={{profile_image_url}} data-action-click="ProfilePic">\
    <div class="body">\
      <span class="fullname">{{name}}</span> <span class="screenname">@{{screen_name}}</span><span class="timestamp" data-timestamp="{{created_at}}">{{created_since}}</span>\
      <div class="text">{{{entifiedText}}}</div>\
      {{#include_media}}\
        {{#embed_photo_url}}\
          <img class="photo" data-action-click="Image" data-href="{{embed_photo_url}}" src="{{embed_photo_url_small}}">\
        {{/embed_photo_url}}\
      {{/include_media}}\
    </div>\
  {{/retweet}}\
  {{#is_retweet}}\
    <div class="retweetedby">Retweeted by {{name}} <span class="retweetby-screenname">@{{screen_name}}</span></div>\
  {{/is_retweet}}\
  {{^has_children}}\
    {{#in_reply_to View}}\
      <div class="in_reply_to">\
        <div class="in_reply_to_text">In reply to</div>\
        <div class="tweet">\
          <img class="icon" src={{profile_image_url}} data-action-click="ProfilePic">\
          <div class="body">\
            <span class="fullname">{{name}}</span> <span class="screenname">@{{screen_name}}</span><span class="timestamp" data-timestamp="{{created_at}}">{{created_since}}</span>\
            <div class="text">{{{entifiedText}}}</div>\
          </div>\
        </div>\
      </div>\
    {{/in_reply_to}}\
  {{/has_children}}\
  <div class="actions">\
    {{#include_children}}\
      {{#has_children}}\
        {{:child_count}}return this.v(\'children\').length(){{/child_count}}\
        <div class="child-count">{{child_count}}</div>\
      {{/has_children}}\
    {{/include_children}}\
    {{^isDM}}\
      <div class="action-box" data-action-click="SendReply"><div class="action reply"></div></div>\
      <div class="action-box" data-action-click="SendRetweet"><div class="action retweet"></div></div>\
      <div class="action-box" data-action-click="ToggleFavorite"><div class="action favorite {{#favorited}}active{{/favorited}}"></div></div>\
    {{/isDM}}\
    {{#isDM}}\
      <div class="action-box" data-action-click="SendDM"><div class="action reply"></div></div>\
    {{/isDM}}\
  </div>\
  {{#include_tags}}\
    <div class="tags">\
      {{#tags}}\
        {{#_ View.Drag}}<div class="tag-wrapper" {{{drag_attributes}}}><div class="tag tag-{{type}}{{#dragging}} {{dragging}}{{/dragging}}">{{title}}</div></div>{{/_}}\
      {{/tags}}\
    </div>\
  {{/include_tags}}\
  {{#include_children}}\
    {{#has_children}}\
      <div class="nested-tweets">\
        {{#tweet_open}}\
          {{#children}}\
            <div class="tweet">\
              <img class="icon" src={{profile_image_url}} data-action-click="ProfilePic">\
              <div class="body">\
                <span class="fullname">{{name}}</span> <span class="screenname">@{{screen_name}}</span><span class="timestamp" data-timestamp="{{created_at}}">{{created_since}}</span>\
                <div class="text">{{{entifiedText}}}</div>\
              </div>\
            </div>\
          {{/children}}\
        {{/tweet_open}}\
      </div>\
    {{/has_children}}\
  {{/include_children}}\
</div>\
{{/_}}',
'create-list': '<div class="create-list-modal">\
  Name: <input>\
</div>',
'error_dialog': '<div class="dialog error-view">\
  <div class="inner" data-action-click="Ignore">\
    {{:has_errors}}return this.v(\'errors\').length{{/has_errors}}\
    {{#has_errors}}\
      <div class="summary">Twitter is unavailable.  Retrying every 60 seconds.</div>\
      <div class="errors">\
        {{#errors}}\
          {{#_ View}}\
            <div class="error error-{{type}}">\
              <div class="error-title"></div>\
              <div class="error-close" data-action-click="RemoveError"></div>\
              {{#details}}{{#text}}<div class="error-text">{{text}}</div>{{/text}}{{/details}}\
            </div>\
          {{/_}}\
        {{/errors}}\
      </div>\
    {{/has_errors}}\
    {{^has_errors}}\
      No problems.\
    {{/has_errors}}\
  </div>\
</div>',
'imageview': '<div class="dialog image-view">\
  <div class="inner" data-action-click="Ignore">\
    <div class="img-wrapper{{#tweet}} with-tweet{{/tweet}}">\
      <img class="img" src="{{url}}">\
      {{#tweet}}{{>basic_tweet}}{{/#tweet}}\
    </div>\
  </div>\
</div>',
'main': '<div class="main">\
  <div class="col right">\
    {{:is_dm_list}}return this.v(\'current_list\').isDM();{{/is_dm_list}}\
    {{^is_dm_list}}\
      <div class="pane compose" data-action-click="ComposeTweet">\
        Tweet...\
      </div>\
    {{/is_dm_list}}\
    {{#is_dm_list}}\
      <div class="pane compose" data-action-click="ComposeDM">\
        Message...\
      </div>\
    {{/is_dm_list}}\
    <div class="right-list">\
      <div class="pane lists">\
        <div class="lists-header">\
          <div class="lists-gear" data-action-click="OpenPreferences">@</div>\
          <div class="lists-title" data-action-click="ToggleShow">{{name}}</div>\
          {{#_ View name:"activity" className:"lists-activity"}}<div class="{{#activity}}show{{/activity}}"></div>{{/_}}\
          {{#account}}{{#errors View name:"error" className:"lists-error"}}<div class="{{#error}}show{{/error}}" data-action-click="OpenErrors"></div>{{/errors}}{{/account}}\
        </div>\
        <div class="current-lists {{#open}}open{{/open}}">\
          {{#lists ViewSet}}\
            {{#_ View.Drop name:m.name()}}\
              <div class="list{{#selected}} selected{{/selected}}{{#dropzone}} dropzone{{/dropzone}} hotness{{hotness}}" data-action-click="SelectList" data-action-drop="DropToList" {{{drop_attributes}}}>\
                <div class="title">{{title}}</div><div class="unread unread{{unread}}">{{unread}}</div>\
              </div>\
            {{/_}}\
          {{/lists}}\
          {{#_ View.Drop}}\
            <div class="create-list{{#dropzone}} dropzone{{/dropzone}}" data-action-drop="DropToNewList" {{{drop_attributes}}}>\
              <input placeholder="Create list or search..." data-action-change="NewList">\
            </div>\
          {{/_}}\
        </div>\
      </div>\
      {{#_ View}}\
        <div class="pane current-list{{#editMode}} edit-mode{{/editMode}}" data-action-click="EditList">\
          <div class="list-header">\
            <div class="title">\
              {{^editMode}}{{#current_list}}{{title}}{{/current_list}}{{/editMode}}\
              {{#editMode}}{{#current_list View.Input}}<input {{{input_attributes}}} value="{{title}}" name="title">{{/current_list}}{{/editMode}}\
            </div>\
          </div>\
          <div class="viz">Visual: \
            {{^editMode}}\
              {{#current_list}}\
                <span class="tag">{{viz}}</span>\
              {{/current_list}}\
            {{/editMode}}\
            {{#editMode}}\
              {{#current_list View}}\
                <select data-action-change="ChangeViz">\
                  <option value="list" {{viz_list}}>list</option>\
                  <option value="stack" {{viz_stack}}>stack</options>\
                  <option value="media" {{viz_media}}>media</options>\
                </select>\
              {{/current_list}}\
            {{/editMode}}\
          </div>\
          {{#current_list}}\
            {{#_ View.Drop}}\
              <div class="list-tags{{#dropzone}} dropzone{{/dropzone}}" data-action-drop="DropInclude" {{{drop_attributes}}}>\
                Include:\
                {{#includeTags}}\
                  {{#tag View}}<div class="kill-tag" data-action-click="KillInclude"><div class="tag">{{title}}</div></div>{{/tag}}\
                {{/includeTags}}\
              </div>\
            {{/_}}\
            {{#_ View.Drop}}\
              <div class="list-tags{{#dropzone}} dropzone{{/dropzone}}" data-action-drop="DropExclude" {{{drop_attributes}}}>\
                Exclude:\
                {{#excludeTags}}\
                  {{#tag View}}<div class="kill-tag" data-action-click="KillExclude"><div class="tag">{{title}}</div></div>{{/tag}}\
                {{/excludeTags}}\
              </div>\
            {{/_}}\
          {{/current_list}}\
          <div class="list-footer">\
            {{#editMode}}\
              {{#current_list}}\
                {{#canRemove}}\
                  <div class="button danger" data-action-click="RemoveList">Remove</div>\
                {{/canRemove}}\
              {{/current_list}}\
              <div class="clear"></div>\
            {{/editMode}}\
          </div>\
        </div>\
      {{/_}}\
    </div>\
  </div>\
  <div class="col left">\
    <div class="pane">\
      <div class="filter">\
        {{:filterfull}}return !!this.v(\'filter\'){{/filterfull}}\
        {{#_ View.Input.Drop}}\
          <input id="filter" name="filter" class="{{#dropzone}}dropzone{{/dropzone}}" placeholder="Filter..." {{{input_attributes}}} data-action-change="Filter" data-action-drop="DropFilter" {{{drop_attributes}}}>{{#filterfull}}<div class="filter-clear" data-action-click="FilterClear"></div>{{/filterfull}}\
        {{/_}}\
      </div>\
      <div class="tweets" data-action-scroll-insert-above="InsertAtTop">\
        {{#current_list View updateOn:"viz"}}\
          {{:viz_list}}return this.v(\'viz\') === \'list\' ? \'selected\' : \'\'{{/viz_list}}\
          {{:viz_stack}}return this.v(\'viz\') === \'stack\' ? \'selected\' : \'\'{{/viz_stack}}\
          {{:viz_media}}return this.v(\'viz\') === \'media\' ? \'selected\' : \'\'{{/viz_media}}\
          {{#viz_list}}\
            {{#tweets ViewSet.TextFilter.LiveList name:"tweets" filterKeys:["text","at_screen_name","name","tagkeys"] }}\
              {{>basic_tweet}}\
            {{/tweets}}\
          {{/viz_list}}\
          {{#viz_stack}}\
            {{#tweets ViewSet.TextFilter.StackedList.LiveList name:"tweets" stackKey:"conversation" filterKeys:["text","at_screen_name","name","tagkeys"] }}\
              {{>basic_tweet}}\
            {{/tweets}}\
          {{/viz_stack}}\
          {{#viz_media}}\
            {{#tweets ViewSet.TextFilter.LiveList name:"tweets" filterKeys:["text","at_screen_name","name","tagkeys"] }}\
              {{>media}}\
            {{/tweets}}\
          {{/viz_media}}\
        {{/current_list}}\
      </div>\
    </div>\
  </div>\
</div>',
'media': '{{#embed_photo_url}}\
  {{#_ View}}\
    <div class="media-box">\
      <div class="photo" data-action-click="Image" data-href="{{embed_photo_url}}" style="background-image: url(\'{{embed_photo_url_small}}\')"></div>\
    </div>\
  {{/_}}\
{{/embed_photo_url}}',
'readability': '<div class="dialog readability{{#show}} show{{/show}}" data-action-orientationchange="OrientationChange">\
  <div class="inner" id="readability-scroller" data-action-swipe-left="Forward" data-action-swipe-right="Backward" data-action-close="Close" data-action-click="Ignore">\
    {{#title}}\
      <div class="title">{{{title}}}</div>\
    {{/title}}\
    {{^title}}\
      <div class="title">Loading ...</div>\
    {{/title}}\
    {{#text}}<div style="{{translate}}" class="text">{{{text}}}</div>{{/text}}\
    <div class="readability-logo"></div>\
    <div class="footer pages{{pages}} pagenr{{pagenr}}"></div>\
    <div class="web button" data-action-click="OpenWeb">Web</div>\
  </div>\
</div>',
'tweet_dialog': '<div class="dialog tweet-dialog">\
  <div class="inner">\
    <div class="tweet-dialog-header">\
      {{:is_dm}}return this.v(\'isDM\'){{/is_dm}}\
      {{#isTweet}}Tweet{{/isTweet}}\
      {{#isRetweet}}Retweet{{/isRetweet}}\
      {{#isReply}}Reply{{/isReply}}\
      {{#is_dm}}\
        {{#screen_name}}Private message to @{{screen_name}}{{/screen_name}}\
        {{^screen_name}}{{#_ View.Input}}Private message to @<input autofocus type="to" class="tweet-dm-to" name="target" {{{input_attributes}}}>{{/_}}{{/screen_name}}\
      {{/is_dm}}\
    </div>\
    <div class="tweet-dialog-body">\
      {{#isEdit}}{{#_ View}}<textarea type="url" class="tweet-text-edit" {{^is_dm}}autofocus{{/is_dm}}{{#screen_name}} autofocus{{/screen_name}} name="text" data-action-input="Input">{{text}}</textarea>{{/_}}{{/isEdit}}\
      {{^isEdit}}<div class="tweet-text" data-action-click="Edit">{{text}}</div>{{/isEdit}}\
    </div>\
    <div class="tweet-dialog-footer">\
      <div class="suggestions">\
        <div class="inside">\
          {{#usuggestions}}\
            {{#_ View className:\'user-suggestion\'}}\
              <div data-action-click="Suggestion">\
                <div class="name">{{name}}</div>\
                <div class="screenname">@{{screenname}}</div>\
              </div>\
            {{/_}}\
          {{/usuggestions}}\
          {{#hsuggestions}}\
            {{#_ View className:\'hashtag-suggestion\'}}\
              <div data-action-click="Suggestion">\
                {{name}}\
              </div>\
            {{/_}}\
          {{/hsuggestions}}\
        </div>\
      </div>\
      <div class="controls">\
        {{#isEdit}}<div class="tweet-count" >{{count}}</div>{{/isEdit}}\
        <div class="button" data-action-click="CancelButton">Cancel</div>\
        {{#isTweet}}<div class="button primary" data-action-click="TweetButton">Tweet</div>{{/isTweet}}\
        {{#isRetweet}}<div class="button primary" data-action-click="RetweetButton">Retweet</div>{{/isRetweet}}\
        {{#isReply}}<div class="button primary" data-action-click="ReplyButton">Reply</div>{{/isReply}}\
        {{#is_dm}}<div class="button primary" data-action-click="DMButton">Send</div>{{/is_dm}}\
      </div>\
    </div>\
  </div>\
</div>',
'tweet_profile': '<div class="dialog tweet-profile">\
  <div class="border" data-action-click="Ignore">\
    <div class="background" style="{{#profile_background_image_url}}background-image:url({{profile_background_image_url}});{{^profile_background_tile}}background-repeat: no-repeat;{{/profile_background_tile}}{{/profile_background_image_url}}{{#profile_background_color}}background-color:#{{profile_background_color}};{{/profile_background_color}}">\
      <div class="inner">\
        <div class="left">\
          <img class="icon" src="{{profile_image_url}}">\
          <div class="body">\
            <span class="fullname">{{name}}</span>\
            <span class="screenname">@{{screen_name}}</span>\
          </div>\
          {{#location}}<div class="location">{{location}}</div>{{/location}}\
          {{#url}}<div class="url">{{url}}</span></div>{{/url}}\
          {{#description}}<div class="description">{{description}}</div>{{/description}}\
        </div>\
        <div class="right">\
          <div class="stats">\
            <div class="tweet-nr"><div class="label">Tweets</div>{{tweet_count}}</div>\
            <div class="following-nr"><div class="label">Following</div>{{friends_count}}</div>\
            <div class="followers-nr"><div class="label">Followers</div>{{followers_count}}</div>\
          </div>\
          {{#followed_by}}\
            <div class="button unfollow" data-action-click="Unfollow">Unfollow</div>\
          {{/followed_by}}\
          {{^followed_by}}\
            <div class="button follow" data-action-click="Follow">Follow</div>\
          {{/followed_by}}\
        </div>\
      </div>\
    </div>\
  </div>\
</div>',
'videoview': '<div class="dialog image-view">\
  <div class="inner" data-action-click="Ignore">\
    {{{embed}}}\
  </div>\
</div>',
'welcome': '<div class="dialog welcome">\
  <div class="inner">\
    <div class="welcome-title">Welcome to Tweedie</div>\
    <div class="welcome-body">To start, hit the button and log into Twitter.</div>\
    <div class="button" data-action-click="Start">Start</div>\
  </div>\
</div>',
'_':null};
function main()
{
  Log.start();
  document.addEventListener("resume", function()
  {
    Log.start();
  });
  document.addEventListener("pause", function()
  {
    Log.stop();
  });

  var RootModel = Model.create(
  {
    account: Model.Property,
    current_list: Model.Property,
    lists: Model.Property,
    name: function()
    {
      return this.account().tweetLists.screenname.slice(1);
    },
    filter: Model.Property
  });

  var lgrid = grid.get();

  var account = new Account();

  models = new RootModel(
  {
    account: account,
    current_list: account.tweetLists.lists.models[0],
    lists: account.tweetLists.lists,
    filter: ""
  });

  account.on("screenNameChange", function()
  {
    models.emit("update");
  });

  var root = new RootView(
  {
    node: document.getElementById("root"),
    template: __resources.main,
    partials: __resources,
    model: models,
    properties:
    {
      open: true,
      include_children: true,
      include_tags: true,
      include_media: true
    },
    controllers:
    [
      new TweetController(),
      new ListController(),
      new FilterController(),
      new GlobalController(),
      new AccountController()
    ]
  });
  
  Co.Forever(this,
    function()
    {
      var rel = {};
      var times = document.querySelectorAll("[data-timestamp]");
      for (var i = times.length - 1; i >= 0; i--)
      {
        var time = times[i];
        var since = Tweet.tweetTime(time.dataset.timestamp, rel);
        time.innerText = since;
        if (!rel.relative)
        {
          delete time.dataset.timestamp;
        }
      }
      return Co.Sleep(10);
    }
  );
  
  Co.Routine(this,
    function()
    {
      return lgrid.read("/accounts");
    },
    function(info)
    {
      if (info())
      {
        account.on("opened", splash);
        account.open();
      }
      else
      {
        // Welcome
        splash();
        new ModalView(
        {
          node: document.getElementById("root-dialog"),
          template: __resources.welcome,
          partials: __resources,
          model: {},
          clickToClose: false,
          controller:
          {
            onStart: function(m, v)
            {
              v.close();
              account.open();
            }
          }
        });
      }
    }
  );
}

function splash()
{
  navigator.splashscreen && navigator.splashscreen.hide();
}
