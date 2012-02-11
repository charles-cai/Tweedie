var Error = Model.create(
{
  constructor: function(__super, account)
  {
    __super();
    this._account = account;
    this._errors = [];
    this._pending = {};
  },

  error: function()
  {
    return this._errors.length;
  },

  add: function(op, details)
  {
    var error =
    {
      op: op,
      details: details
    };
    var key = JSON.stringify(error);
    if (!this._pending[key])
    {
      this._pending[key] = true;
      this._errors.push(error);
      this._runq();
    }
  },

  _runq: function()
  {
    if (this._errors.length === 1)
    {
      this.emit("update");
      Co.Forever(this,
        function()
        {
          Co.Sleep(60);
        },
        function()
        {
          var errors = this._errors;
          this._errors = [];
          this._pending = {};
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
            Log.exception("Error._runq", e);
          }
          if (!this._errors.length)
          {
            this.emit("update");
            return Co.Break();
          }
          return true;
        }
      );
    }
  }
});
