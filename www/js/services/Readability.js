(function()
{
  var ReadabilityModel = Model.create(
  {
    title: Model.Property,
    text: Model.Property
  });

  var lgrid = grid.get();
  var selector = /^\/readable=(.*)$/;
  var pending = null;
  var stage = document.createElement("div");

  var lru = new xo.LRU(5);
  lru.on("evict", function(event, path)
  {
    lgrid.evict(path);
  });
  function touch(path)
  {
    lru.get(path, function()
    {
      return true;
    });
  }

  lgrid.watch(selector, function(op, path)
  {
    if (op == xo.Grid.READ)
    {
      var url = selector.exec(path)[1];

      var model = new ReadabilityModel();
      lgrid.write(path, model, touch);

      Co.Routine(this,
        function()
        {
          if (pending)
          {
            pending.abort();
            lgrid.remove(pending._gridPath);
          }
          pending =
          {
            method: "POST",
            url: "http://www.readability.com/articles/queue",
            data: "url=" + url,
            proxy: readabilityProxy,
            _gridPath: path
          };
          return Ajax.create(pending);
        },
        function(r)
        {
          try
          {
            pending = null;
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
            lgrid.remove(path);
          }
        }
      );
    }
  });
})();

/* var Readability =
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
}; */
