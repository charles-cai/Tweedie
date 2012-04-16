var __resources = {
'basic_tweet': '{{#_ View}}\
<div class="tweet"{{#has_children}} data-action-click="OpenTweet"{{/has_children}}>\
  {{#retweet}}\
    <img class="icon" src={{profile_image_url}} data-action-click="ProfilePic">\
    <div class="body">\
      <span class="fullname">{{name}}</span> <span class="screenname">@{{screen_name}}</span><span class="timestamp" data-timestamp="{{created_at}}">{{created_since}}</span>\
      <div class="text">{{{entifiedText}}}</div>\
      {{#include_media}}\
        {{#embed_photo_url}}\
          <img class="photo" data-action-click="Image" data-href="{{embed_photo_url}}" src="{{embed_photo_url_small}}">\
        {{/embed_photo_url}}\
      {{/include_media}}\
    </div>\
  {{/retweet}}\
  {{^retweet}}\
    <img class="icon" src={{profile_image_url}} data-action-click="ProfilePic">\
    <div class="body">\
      <span class="fullname">{{conversation_name}}</span> <span class="screenname">@{{conversation_screen_name}}</span><span class="timestamp" data-timestamp="{{created_at}}">{{created_since}}</span>\
      <div class="text">{{{entifiedText}}}</div>\
      {{#include_media}}\
        {{#embed_photo_url}}\
          <img class="photo" data-action-click="Image" data-href="{{embed_photo_url}}" src="{{embed_photo_url_small}}">\
        {{/embed_photo_url}}\
      {{/include_media}}\
    </div>\
  {{/retweet}}\
  {{#is_retweet}}\
    <div class="retweetedby">Retweeted by {{name}} <span class="retweetby-screenname">@{{screen_name}}</span></div>\
  {{/is_retweet}}\
  {{^has_children}}\
    {{#include_replies}}\
      {{#in_reply_to View}}\
        <div class="in_reply_to">\
          <div class="in_reply_to_text">In reply to</div>\
          <div class="tweet">\
            <img class="icon" src={{profile_image_url}} data-action-click="ProfilePic">\
            <div class="body">\
              <span class="fullname">{{name}}</span> <span class="screenname">@{{screen_name}}</span><span class="timestamp" data-timestamp="{{created_at}}">{{created_since}}</span>\
              <div class="text">{{{entifiedText}}}</div>\
            </div>\
          </div>\
        </div>\
      {{/in_reply_to}}\
    {{/include_replies}}\
  {{/has_children}}\
  <div class="actions">\
    {{#include_children}}\
      {{#has_children}}\
        {{:child_count}}return this.v(\'children\').length(){{/child_count}}\
        <div class="child-count">{{child_count}}</div>\
      {{/has_children}}\
    {{/include_children}}\
    {{^isDM}}\
      <div class="action-box" data-action-click="SendReply"><div class="action reply"></div></div>\
      <div class="action-box" data-action-click="SendRetweet"><div class="action retweet"></div></div>\
      <div class="action-box" data-action-click="ToggleFavorite"><div class="action favorite {{#favorited}}active{{/favorited}}"></div></div>\
    {{/isDM}}\
    {{#isDM}}\
      <div class="action-box" data-action-click="SendDM"><div class="action reply"></div></div>\
    {{/isDM}}\
  </div>\
  {{#include_tags}}\
    <div class="tags">\
      {{#tags}}\
        {{#_ View.Drag}}<div class="tag-wrapper" {{{drag_attributes}}}><div class="tag tag-{{type}}{{#dragging}} {{dragging}}{{/dragging}}">{{title}}</div></div>{{/_}}\
      {{/tags}}\
    </div>\
  {{/include_tags}}\
  {{#include_children}}\
    {{#has_children}}\
      <div class="nested-tweets">\
        {{#tweet_open}}\
          {{#children}}\
            <div class="tweet">\
              <img class="icon" src={{profile_image_url}} data-action-click="ProfilePic">\
              <div class="body">\
                <span class="fullname">{{name}}</span> <span class="screenname">@{{screen_name}}</span><span class="timestamp" data-timestamp="{{created_at}}">{{created_since}}</span>\
                <div class="text">{{{entifiedText}}}</div>\
              </div>\
            </div>\
          {{/children}}\
        {{/tweet_open}}\
      </div>\
    {{/has_children}}\
  {{/include_children}}\
</div>\
{{/_}}',
'create-list': '<div class="create-list-modal">\
  Name: <input>\
</div>',
'error_dialog': '<div class="dialog error-view">\
  <div class="inner" data-action-click="Ignore">\
    {{:has_errors}}return this.v(\'errors\').length{{/has_errors}}\
    {{#has_errors}}\
      <div class="summary">Twitter is unavailable.  Retrying every 60 seconds.</div>\
      <div class="errors">\
        {{#errors}}\
          {{#_ View}}\
            <div class="error error-{{type}}">\
              <div class="error-title"></div>\
              <div class="error-close" data-action-click="RemoveError"></div>\
              {{#details}}{{#text}}<div class="error-text">{{text}}</div>{{/text}}{{/details}}\
            </div>\
          {{/_}}\
        {{/errors}}\
      </div>\
    {{/has_errors}}\
    {{^has_errors}}\
      No problems.\
    {{/has_errors}}\
  </div>\
</div>',
'imageview': '<div class="dialog image-view">\
  <div class="inner" data-action-click="Ignore">\
    <div class="img-wrapper{{#tweet}} with-tweet{{/tweet}}">\
      <img class="img" src="{{url}}">\
      {{#tweet}}{{>basic_tweet}}{{/#tweet}}\
    </div>\
  </div>\
</div>',
'main': '<div class="main">\
  <div class="col right">\
    {{:is_dm_list}}return this.v(\'current_list\').isDM();{{/is_dm_list}}\
    {{^is_dm_list}}\
      <div class="pane compose" data-action-click="ComposeTweet">\
        Tweet...\
      </div>\
    {{/is_dm_list}}\
    {{#is_dm_list}}\
      <div class="pane compose" data-action-click="ComposeDM">\
        Message...\
      </div>\
    {{/is_dm_list}}\
    <div class="right-list">\
      <div class="pane lists">\
        <div class="lists-header">\
          <div class="lists-gear" data-action-click="OpenPreferences">@</div>\
          <div class="lists-title" data-action-click="ToggleShow">{{name}}</div>\
          {{#_ View name:"activity" className:"lists-activity"}}<div class="{{#activity}}show{{/activity}}"></div>{{/_}}\
          {{#account}}{{#errors View name:"error" className:"lists-error"}}<div class="{{#error}}show{{/error}}" data-action-click="OpenErrors"></div>{{/errors}}{{/account}}\
        </div>\
        <div class="current-lists {{#open}}open{{/open}}">\
          {{#lists ViewSet}}\
            {{#_ View.Drop name:m.name()}}\
              <div class="list{{#selected}} selected{{/selected}}{{#dropzone}} dropzone{{/dropzone}} hotness{{hotness}}" data-action-click="SelectList" data-action-drop="DropToList" {{{drop_attributes}}}>\
                <div class="title">{{title}}</div><div class="unread unread{{unread}}">{{unread}}</div>\
              </div>\
            {{/_}}\
          {{/lists}}\
          {{#_ View.Drop}}\
            <div class="create-list{{#dropzone}} dropzone{{/dropzone}}" data-action-drop="DropToNewList" {{{drop_attributes}}}>\
              <input placeholder="Create list or search..." data-action-change="NewList">\
            </div>\
          {{/_}}\
        </div>\
      </div>\
      {{#_ View}}\
        <div class="pane current-list{{#editMode}} edit-mode{{/editMode}}" data-action-click="EditList">\
          <div class="list-header">\
            <div class="title">\
              {{^editMode}}{{#current_list}}{{title}}{{/current_list}}{{/editMode}}\
              {{#editMode}}{{#current_list View.Input}}<input {{{input_attributes}}} value="{{title}}" name="title">{{/current_list}}{{/editMode}}\
            </div>\
          </div>\
          <div class="viz">Visual: \
            {{^editMode}}\
              {{#current_list View}}\
                <span class="tag">{{viz}}</span>\
              {{/current_list}}\
            {{/editMode}}\
            {{#editMode}}\
              {{#current_list View}}\
                <select data-action-change="ChangeViz">\
                  <option value="list" {{viz_list}}>list</option>\
                  <option value="stack" {{viz_stack}}>stack</options>\
                  <option value="media" {{viz_media}}>media</options>\
                </select>\
              {{/current_list}}\
            {{/editMode}}\
          </div>\
          {{#current_list}}\
            {{#_ View.Drop}}\
              <div class="list-tags{{#dropzone}} dropzone{{/dropzone}}" data-action-drop="DropInclude" {{{drop_attributes}}}>\
                Include:\
                {{#includeTags}}\
                  {{#tag View}}<div class="kill-tag" data-action-click="KillInclude"><div class="tag">{{title}}</div></div>{{/tag}}\
                {{/includeTags}}\
              </div>\
            {{/_}}\
            {{#_ View.Drop}}\
              <div class="list-tags{{#dropzone}} dropzone{{/dropzone}}" data-action-drop="DropExclude" {{{drop_attributes}}}>\
                Exclude:\
                {{#excludeTags}}\
                  {{#tag View}}<div class="kill-tag" data-action-click="KillExclude"><div class="tag">{{title}}</div></div>{{/tag}}\
                {{/excludeTags}}\
              </div>\
            {{/_}}\
          {{/current_list}}\
          <div class="list-footer">\
            {{#editMode}}\
              {{#current_list}}\
                {{#canRemove}}\
                  <div class="button danger" data-action-click="RemoveList">Remove</div>\
                {{/canRemove}}\
              {{/current_list}}\
              <div class="clear"></div>\
            {{/editMode}}\
          </div>\
        </div>\
      {{/_}}\
    </div>\
  </div>\
  <div class="col left">\
    <div class="pane">\
      <div class="filter">\
        {{:filterfull}}return !!this.v(\'filter\'){{/filterfull}}\
        {{#_ View.Input.Drop}}\
          <input id="filter" name="filter" class="{{#dropzone}}dropzone{{/dropzone}}" placeholder="Filter..." {{{input_attributes}}} data-action-change="Filter" data-action-drop="DropFilter" {{{drop_attributes}}}>{{#filterfull}}<div class="filter-clear" data-action-click="FilterClear"></div>{{/filterfull}}\
        {{/_}}\
      </div>\
      <div class="tweets" data-action-scroll-insert-above="InsertAtTop">\
        {{#current_list View updateOn:"viz"}}\
          {{:viz_list}}return this.v(\'viz\') === \'list\' ? \'selected\' : \'\'{{/viz_list}}\
          {{:viz_stack}}return this.v(\'viz\') === \'stack\' ? \'selected\' : \'\'{{/viz_stack}}\
          {{:viz_media}}return this.v(\'viz\') === \'media\' ? \'selected\' : \'\'{{/viz_media}}\
          {{#viz_list}}\
            {{#tweets ViewSet.TextFilter.LiveList name:"tweets" filterKeys:["text","at_screen_name","name","tagkeys"] }}\
              {{>basic_tweet}}\
            {{/tweets}}\
          {{/viz_list}}\
          {{#viz_stack}}\
            {{#tweets ViewSet.TextFilter.StackedList.LiveList name:"tweets" stackKey:"conversation_screen_name" filterKeys:["text","at_screen_name","name","tagkeys"] }}\
              {{>basic_tweet}}\
            {{/tweets}}\
          {{/viz_stack}}\
          {{#viz_media}}\
            {{#tweets ViewSet.TextFilter.LiveList name:"tweets" filterKeys:["text","at_screen_name","name","tagkeys"] }}\
              {{>media}}\
            {{/tweets}}\
          {{/viz_media}}\
        {{/current_list}}\
      </div>\
    </div>\
  </div>\
</div>',
'media': '{{#embed_photo_url}}\
  {{#_ View}}\
    <div class="media-box">\
      <div class="photo" data-action-click="Image" data-href="{{embed_photo_url}}" style="background-image: url(\'{{embed_photo_url_small}}\')"></div>\
    </div>\
  {{/_}}\
{{/embed_photo_url}}',
'readability': '<div class="dialog readability{{#show}} show{{/show}}" data-action-orientationchange="OrientationChange">\
  <div class="inner" id="readability-scroller" data-action-swipe-left="Forward" data-action-swipe-right="Backward" data-action-close="Close" data-action-click="IgnoreOrSwipe">\
    {{#title}}\
      <div class="title">{{{title}}}</div>\
    {{/title}}\
    {{^title}}\
      <div class="title">Loading ...</div>\
    {{/title}}\
    {{#text}}<div style="{{translate}}" class="text">{{{text}}}</div>{{/text}}\
    <div class="readability-logo"></div>\
    <div class="footer pages{{pages}} pagenr{{pagenr}}"></div>\
    <div class="web button" data-action-click="OpenWeb">Web</div>\
  </div>\
</div>',
'tweet_dialog': '<div class="dialog tweet-dialog">\
  <div class="inner">\
    <div class="tweet-dialog-header">\
      {{:is_dm}}return this.v(\'isDM\'){{/is_dm}}\
      {{#isTweet}}Tweet{{/isTweet}}\
      {{#isRetweet}}Retweet{{/isRetweet}}\
      {{#isReply}}Reply{{/isReply}}\
      {{#is_dm}}\
        {{#screen_name}}Private message to @{{screen_name}}{{/screen_name}}\
        {{^screen_name}}{{#_ View.Input}}Private message to @<input autofocus type="to" class="tweet-dm-to" name="target" {{{input_attributes}}}>{{/_}}{{/screen_name}}\
      {{/is_dm}}\
    </div>\
    <div class="tweet-dialog-body">\
      {{#isEdit}}{{#_ View}}<textarea type="url" class="tweet-text-edit" {{^is_dm}}autofocus{{/is_dm}}{{#screen_name}} autofocus{{/screen_name}} name="text" data-action-input="Input">{{text}}</textarea>{{/_}}{{/isEdit}}\
      {{^isEdit}}<div class="tweet-text" data-action-click="Edit">{{text}}</div>{{/isEdit}}\
    </div>\
    <div class="tweet-dialog-footer">\
      <div class="suggestions">\
        <div class="inside">\
          {{#usuggestions}}\
            {{#_ View className:\'user-suggestion\'}}\
              <div data-action-click="Suggestion">\
                <div class="name">{{name}}</div>\
                <div class="screenname">@{{screenname}}</div>\
              </div>\
            {{/_}}\
          {{/usuggestions}}\
          {{#hsuggestions}}\
            {{#_ View className:\'hashtag-suggestion\'}}\
              <div data-action-click="Suggestion">\
                {{name}}\
              </div>\
            {{/_}}\
          {{/hsuggestions}}\
        </div>\
      </div>\
      <div class="controls">\
        {{#isEdit}}<div class="tweet-count" >{{count}}</div>{{/isEdit}}\
        <div class="button" data-action-click="CancelButton">Cancel</div>\
        {{#isTweet}}<div class="button primary" data-action-click="TweetButton">Tweet</div>{{/isTweet}}\
        {{#isRetweet}}<div class="button primary" data-action-click="RetweetButton">Retweet</div>{{/isRetweet}}\
        {{#isReply}}<div class="button primary" data-action-click="ReplyButton">Reply</div>{{/isReply}}\
        {{#is_dm}}<div class="button primary" data-action-click="DMButton">Send</div>{{/is_dm}}\
      </div>\
    </div>\
  </div>\
</div>',
'tweet_profile': '<div class="dialog tweet-profile">\
  <div class="border" data-action-click="Ignore">\
    <div class="background" style="{{#profile_background_image_url}}background-image:url({{profile_background_image_url}});{{^profile_background_tile}}background-repeat: no-repeat;{{/profile_background_tile}}{{/profile_background_image_url}}{{#profile_background_color}}background-color:#{{profile_background_color}};{{/profile_background_color}}">\
      <div class="inner">\
        <div class="left">\
          <img class="icon" src="{{profile_image_url}}">\
          <div class="body">\
            <span class="fullname">{{name}}</span>\
            <span class="screenname">@{{screen_name}}</span>\
          </div>\
          {{#location}}<div class="location">{{location}}</div>{{/location}}\
          {{#url}}<div class="url">{{url}}</span></div>{{/url}}\
          {{#description}}<div class="description">{{description}}</div>{{/description}}\
        </div>\
        <div class="right">\
          <div class="stats">\
            <div class="tweet-nr"><div class="label">Tweets</div>{{tweet_count}}</div>\
            <div class="following-nr"><div class="label">Following</div>{{friends_count}}</div>\
            <div class="followers-nr"><div class="label">Followers</div>{{followers_count}}</div>\
          </div>\
          {{#followed_by}}\
            <div class="button unfollow" data-action-click="Unfollow">Unfollow</div>\
          {{/followed_by}}\
          {{^followed_by}}\
            <div class="button follow" data-action-click="Follow">Follow</div>\
          {{/followed_by}}\
        </div>\
      </div>\
    </div>\
  </div>\
</div>',
'videoview': '<div class="dialog image-view">\
  <div class="inner" data-action-click="Ignore">\
    {{{embed}}}\
  </div>\
</div>',
'welcome': '<div class="dialog welcome">\
  <div class="inner">\
    <div class="welcome-title">Welcome to Tweedie</div>\
    <div class="welcome-body">To start, hit the button and log into Twitter.</div>\
    <div class="button" data-action-click="Start">Start</div>\
  </div>\
</div>',
'_':null};
