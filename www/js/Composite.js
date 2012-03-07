var Composite =
{
  _cache: {},

  mergeIcons: function(topUrl, bottomUrl, csize, isize, corner)
  {
    var key = topUrl + ":" + bottomUrl + ":" + csize + ":" + isize;
    var val = this._cache[key];
    if (val)
    {
      return val;
    }
    return Co.Routine(this,
      function()
      {
        return Co.Parallel(this,
          function()
          {
            return this._loadImg(topUrl);
          },
          function()
          {
            return this._loadImg(bottomUrl);
          }
        );
      },
      function(imgs)
      {
        imgs = imgs();
        var canvas = document.createElement("canvas");
        canvas.width = csize;
        canvas.height = csize;
        var diff = csize - isize;
        var ctx = canvas.getContext("2d");
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(corner, 0);
        ctx.lineTo(isize - corner, 0);
        ctx.arcTo(isize, 0, isize, corner, corner);
        ctx.lineTo(isize, isize - corner);
        ctx.arcTo(isize, isize, isize - corner, isize, corner);
        ctx.lineTo(corner, isize);
        ctx.arcTo(0, isize, 0, isize - corner, corner);
        ctx.lineTo(0, corner);
        ctx.arcTo(0, 0, corner, 0, corner);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(imgs[0], 0, 0, isize, isize);
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(diff + corner, diff);
        ctx.lineTo(diff + isize - corner, diff);
        ctx.arcTo(diff + isize, diff, diff + isize, diff + corner, corner);
        ctx.lineTo(diff + isize, diff + isize - corner);
        ctx.arcTo(diff + isize, diff + isize, diff + isize - corner, diff + isize, corner);
        ctx.lineTo(diff + corner, diff + isize);
        ctx.arcTo(diff, diff + isize, diff, diff + isize - corner, corner);
        ctx.lineTo(diff, diff + corner);
        ctx.arcTo(diff, diff, diff + corner, diff, corner);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(imgs[1], diff, diff, isize, isize);
        ctx.restore();
        this._cache[key] = canvas.toDataURL("image/png");
        return this._cache[key];
      }
    );
  },

  _loadImg: function(url)
  {
    return Co.Routine(this,
      function()
      {
        var i = document.createElement("img");
        i.src = networkProxy ? networkProxy + escape(url) : url;
        if (i.complete)
        {
          return i;
        }
        else
        {
          i.onload = Co.Callback(this, function()
          {
            return i;
          });
          i.onerror = Co.Callback(this, function()
          {
            throw new Error("Image load failed: " + url);
          });
        }
      }
    );
  }
};
