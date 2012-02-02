var ReadabilityModel = Model.create(
{
  title: Model.Property,
  text: Model.Property
});

var Readability =
{
  _stage: document.createElement("div"),

  read: function(model, url)
  {
    return Co.Routine(this,
      function()
      {
        return Ajax.create(
        {
          method: "POST",
          url: "http://www.readability.com/articles/queue",
          data: "url=" + url,
          proxy: readabilityProxy
        });
      },
      function(r)
      {
        try
        {
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
        }
        return true;
      }
    );
  }
};
