var UrlExpander = Class(Events,
{
  // Service to expand urls
  _serviceUrl: "https://api.twitter.com/1/urls/resolve.json?",
  _batchSize: 50,

  expand: function(urls)
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
            results[url] = this._expanders(json[url]);
          }
        }
        catch (e)
        {
          Log.exception("UrlExpander failed", e);
        }
        return true;
      }
    )
  },

  _expanders: function(url)
  {
    // Instagram
    if (url.indexOf("http://instagr.am/p/") === 0)
    {
      return {
        url: url + "/media?size=m",
        medial_url: url + "/media?size=l",
        type: "photo"
      };
    }
    // YouTube
    else if (url.indexOf("http://www.youtube.com/watch?v=") === 0)
    {
      var v = new xo.Url(url).getParameter("v");
      return {
        url: url,
        type: "video",
        html: '<iframe width="350" height="262" src="http://www.youtube.com/embed/' + v + '?rel=0" frameborder="0" allowfullscreen></iframe>',
        html_large: '<iframe width="640" height="360" src="http://www.youtube.com/embed/' + v + '?rel=0" frameborder="0" allowfullscreen></iframe>'
      }
    }
    // Twitpic
    else if (url.indexOf("http://twitpic.com/") === 0)
    {
      return {
        url: url,
        medial_url: "http://twitpic.com/show/large/" + new xo.Url(url).pathname,
        type: "photo"
      };
    }
    // YFrog
    else if (url.indexOf("http://yfrog.com/") === 0)
    {
      return {
        url: url + ":iphone",
        medial_url: url + ":medium",
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
