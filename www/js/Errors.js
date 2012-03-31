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
              return this._account[error.op](error.details);
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
