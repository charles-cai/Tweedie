var UrlExpander = Class(Events,
{
  // Service to expand urls
  _serviceUrl: "http://api.embed.ly/1/oembed?key=" + KEYS.embedly + "&format=json&urls=",
  _batchSize: 20,

  expand: function(urls)
  {
    if (KEYS.embedly)
    {
      this.emit("networkActivity", true);
      var results = {};
      var u;
      return Co.Forever(this,
        function()
        {
          if (!urls.length)
          {
            this.emit("networkActivity", false);
            return Co.Break(results);
          }
          u = urls.splice(0, this._batchSize);
          return Ajax.create(
          {
            method: "GET",
            url: this._serviceUrl + u.map(escape).join(",")
          });
        },
        function(r)
        {
          try
          {
            r().json().forEach(function(json, idx)
            {
              if (json.url)
              {
                results[u[idx]] = json;
              }
            });
          }
          catch (e)
          {
            Log.exception("UrlExpander failed", e);
          }
          return true;
        }
      );
    }
    else
    {
      return {};
    }
  }
});
