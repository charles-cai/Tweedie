var UrlExpander = Class(Events,
{
  // Service to expand urls
  _serviceUrl: "https://api.twitter.com/1/urls/resolve.json?",
  _batchSize: 50,

  expand: function(urls)
  {
    var results = {};
    var u;
    return Co.Forever(this,
      function()
      {
        if (!urls.length)
        {
          return Co.Break(results);
        }
        u = urls.splice(0, this._batchSize);
        return Ajax.create(
        {
          method: "GET",
          url: this._serviceUrl + u.map(function(url)
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
            results[url] = { url: json[url] };
          }
        }
        catch (e)
        {
          Log.exception("UrlExpander failed", e);
        }
        return true;
      }
    )
  }
});
