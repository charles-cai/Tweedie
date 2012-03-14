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
    Log.timing(key, Date.now() - (Log._times[key] || 0));
    delete Log._times[key];
  },

  timing: function(key, time)
  {
    if (!Log.emit("timing", [ key, time ]))
    {
      Log.info(key, time + "ms");
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
      var count = 0;
      var nidx = -1;
      var removed = [];
      model.forEach(function(m)
      {
        var idx = this.indexOf(m);
        if (idx !== -1)
        {
          removed.push(m);
          this.models.splice(idx, 1);
          if (nidx === -1 || nidx === idx)
          {
            nidx = idx + 1;
          }
          else
          {
            nidx = undefined;
          }
          count++;
        }
      }, this);
      if (count)
      {
        this.emit("remove",
        {
          index: nidx === undefined ? undefined : nidx - count,
          count: count,
          models: removed
        });
        return count;
      }
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
        model.forEach(function(m)
        {
          index[m[key]()] = m;
        });
      }
      else
      {
        index[model[key]()] = model;
      }
    }
    return __super(idx, model);
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

  node: function(check)
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
      if (container.scrollTop + container.offsetHeight * 2 > container.scrollHeight)
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
      else if (container.scrollTop === 0)
      {
        self._scrollIn(0);
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
        self._textFilter(self._srcModels.models);
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
    if (models === this._srcModels.models)
    {
      this._tgtModels.removeAll();
    }

    var keys = this._keys;
    var lookups = this._lookups;
    var filter = this._filterText;

    var include = [];
    if (!filter)
    {
      include = models;
    }
    else
    {
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
