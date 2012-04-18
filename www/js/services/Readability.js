(function()
{
  var ReadabilityModel = Model.create(
  {
    title: Model.Property,
    text: Model.Property,
    error: Model.Property
  });

  var lgrid = grid.get({ lru: 5 });
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
            parameters:
            {
              url: url
            },
            _gridPath: path
          };
          return Ajax.create(pending);
        },
        function(r)
        {
          var text;
          try
          {
            pending = null;
            text = r().text();
            // Remove any iframes (primitive)
            text = text.replace(/<iframe.*?>.*?<\/iframe>/ig, "");
            stage.innerHTML = text;
            model.delayUpdate(function()
            {
              this.title(stage.querySelector("#article-entry-title,#rdb-article-title").innerHTML);
              this.text(stage.querySelector("#rdb-article-content").innerHTML);
            });
            return;
          }
          catch (e)
          {
            // Failed - maybe the Readability selection page - look for the id inside it
          }

          var s = text.indexOf("articleId");
          if (s === -1)
          {
            throw e;
          }

          var articleId = eval(text.slice(s, text.indexOf(",", s)));
          if (!articleId)
          {
            throw Error();
          }
          return Co.Routine(this,
            function()
            {
              // Refetch the page explicityly.  We set the readbar which forces Readability to
              // return the condensed version of the page.
              pending =
              {
                method: "GET",
                url: "http://www.readability.com/articles/" + articleId,
                parameters:
                {
                  readbar: 1
                },
                _gridPath: path
              };
              return Ajax.create(pending);
            },
            function(r)
            {
              pending = null;
              text = r().text();
              // Remove any iframes (primitive)
              text = text.replace(/<iframe.*?>.*?<\/iframe>/ig, "");
              stage.innerHTML = text;
              model.delayUpdate(function()
              {
                this.title(stage.querySelector("#article-entry-title,#rdb-article-title").innerHTML);
                this.text(stage.querySelector("#rdb-article-content").innerHTML);
              });
            }
          );
        },
        function(_)
        {   
          Log.exception("Readability failure");
          model.delayUpdate(function()
          {
            this.title("Failed");
            this.text(url);
            this.error(true);
          });
          lgrid.remove(path);
        }
      );
    }
  });
})();
