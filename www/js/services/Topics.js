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
