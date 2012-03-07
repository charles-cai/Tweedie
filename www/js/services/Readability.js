(function()
{
  var ReadabilityModel = Model.create(
  {
    title: Model.Property,
    text: Model.Property
  });

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
  var lgrid = grid.get({ touch: touch });
  var selector = /^\/readable=(.*)$/;
  var pending = null;
  var stage = document.createElement("div");


  lgrid.watch(selector, function(op, path)
  {
    if (op == xo.Grid.READ)
    {
      var url = selector.exec(path)[1];

      var model = new ReadabilityModel();
      lgrid.write(path, model);

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
            proxy: networkProxy,
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
