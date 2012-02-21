var Topics = Class(Events,
{
  _refreshTimeout: 1000 * 60 * 60 * 24,

  constructor: function(account)
  {
    this._account = account;
    this._lgrid = grid.get();
    this._name2topic = {};
    this._lastupdate = 0;
    Co.Routine(this,
      function()
      {
        return this._restore();
      },
      function()
      {
        if (Date.now() - this._lastupdate > this._refreshTimeout)
        {
          return Co.Routine(this,
            function()
            {
              return this._lastupdate ? Co.Sleep(30) : true; // Dont do this until we've refresh tweets
            },
            function()
            {
              return this._refresh();
            },
            function()
            {
              this._lastupdate = Date.now();
              return this._save();
            }
          );
        }
        else
        {
          return true;
        }
      }
    );
  },

  lookupByScreenName: function(name)
  {
    return this._name2topic[name] || [];
  },

  _refresh: function()
  {
    return Co.Routine(this,
      function()
      {
        return this._account.suggestions();
      },
      function(r)
      {
        return Co.Foreach(this, r(),
          function(suggestion)
          {
            return this._account.suggestions(suggestion().slug);
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
        this._name2topic = hash;
        this.emit("update");
        return true;
      }
    );
  },

  _restore: function()
  {
    return Co.Routine(this,
      function()
      {
        return this._lgrid.mread([
          "/topics/name2topic",
          "/topics/lastupdate"
        ]);
      },
      function(r)
      {
        r = r();
        this._name2topic = r[0] || {};
        this._lastupdate = r[1] || 0;
        return true;
      }
    );
  },

  _save: function()
  {
    return this._lgrid.mwrite([
      [ "/topics/name2topic", this._name2topic ],
      [ "/topics/lastupdate", this._lastupdate ]
    ]);
  }
});
