var Errors = Model.create(
{
  constructor: function(__super, account)
  {
    __super();
    this._lgrid = grid.get();
    this._running = false;
    this._account = account;
    this._errors = [];
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

  add: function(op, details)
  {
    this._add(op, details);
    this._runq();
  },

  _add: function(op, details)
  {
    var error =
    {
      op: op,
      details: details || {}
    };
    this._errors.push(error);
    this._save();
  },

  remove: function(error)
  {
    var idx = this._errors.indexOf(error);
    if (idx !== -1)
    {
      this._errors.splice(idx, 1);
      this.emit("update");
      return true;
    }
    else
    {
      return false;
    }
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
    if (!this._running && this._errors.length)
    {
      this._running = true;
      this.emit("update");
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
    return Co.Routine(this,
      function()
      {
        var errors = this._errors;
        this._errors = [];
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
  },

  _save: function()
  {
    this._lgrid.write("/errors", this._errors.map(function(error)
    {
      return { op: error.op, details: error.details ? error.details.serialize() : null };
    }));
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
              this._add(error.op, new Tweet(error.details));
              break;

            // Everything else is a tweetbox model
            default:
              this._add(error.op, new NewTweetModel(error.details));
              break;
          }
        }, this);
        return true;
      }
    );
  }
});
