var ReadabilityModel = Model.create(
{
  title: Model.Property,
  text: Model.Property
});

var Readability =
{
  _stage: document.createElement("div"),
  _pending: null,
  _cache: new xo.LRU(5),

  _read: function(model, url)
  {
    return Co.Routine(this,
      function()
      {
        this.close();
        this._pending =
        {
          method: "POST",
          url: "http://www.readability.com/articles/queue",
          data: "url=" + url,
          proxy: readabilityProxy
        };
        return Ajax.create(this._pending);
      },
      function(r)
      {
        try
        {
          this._pending = null;
          var stage = this._stage;
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
          this._cache.remove(url);
        }
        return true;
      }
    );
  },

  open: function(url)
  {
    return this._cache.get(url, function()
    {
      var model = new ReadabilityModel(
      {
        text: ""
      });
      this._read(model, url);
      return model;
    }, this);
  },

  close: function()
  {
    if (this._pending)
    {
      this._pending.abort();
      this._pending = null;
      this._last.url = null;
    }
  }
};
