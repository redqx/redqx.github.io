---
layout: post
title:  "关于本站搭建"
categories: [others] 
---



>  Quick Start



tools

base58: https://www.metools.info/code/c74.html

mp4 -> gif : https://www.freeconvert.com/zh/convert/mp4-to-gif





自己配置的其它开源项目

- [gitalk](https://github.com/gitalk/gitalk) 
- 

# 本站配置



博客框架 [jekyll](http://jekyllthemes.org/)

采用主题： [agusmakmun](https://github.com/agusmakmun/agusmakmun.github.io) ， 或者叫[stack-problems](http://jekyllthemes.org/themes/stack-problems/)

通过博主**enovella_**发现的这个简洁主题

其它主题推荐 [huxpro](https://github.com/Huxpro/huxpro.github.io), [chirpy](https://github.com/cotes2020/jekyll-theme-chirpy/)

直接去[jekyll](http://jekyllthemes.org/)下载博客模板 , 之后只需要在模板修改内容, git上传即可



图床问题？

使用 public repository +  page + raw.githubusercontent.com

图片链接替换

```
./img/ 
==>
https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/ 
```



test img show 图床测试



> ssh上传

为什么不用https,这个老是出现问题.

好吧也不能这样说,应该说 ssh出现问题就用https

```
git remote set-url origin git@github.com:i1oveyou/i1oveyou.github.io.git
```



>  upload

```
git add .
git commit -m "happy every day"
git push -u origin master
```





## toc 文章目录配置



 _layouts\post.html

https://github.com/allejo/jekyll-toc

https://www.70apps.com/blog/code/2021/10/27/JEKYLL_TOC_THEME.html

只需要在xx出添加一句`<div class="content_toc">{% include toc.html html=content %}</div>`

如下所示

```
<div class="content_toc">{% include toc.html html=content %}</div>

<div class="content">
  <div class="post">{{ content }}</div>
  {% include share-page.html %}
</div>
```





## avatar头像配置



> _layouts\default.html





```
<a href="/"><img class="profile-avatar" src="{{ site.avatar_url }}" height="75px" width="75px" /></a>
===>改为
<a href="/"><img class="profile-avatar" src="{{ site.avatar_url }}" height="120px" width="120px" /></a>
```



>  static\css\main.css



```
div.col-sm-3 img.profile-avatar {
  border-radius: 150px;
  -webkit-border-radius: 150px;
  -moz-border-radius: 150px;
  -ms-border-radius: 150px;
  -o-border-radius: 150px;
  margin-left: auto;
  margin-right: auto;
}
      
 ===>改为 

div.col-sm-3 img.profile-avatar {
/*  border-radius: 150px;
  -webkit-border-radius: 150px;
  -moz-border-radius: 150px;
  -ms-border-radius: 150px;
  -o-border-radius: 150px;*/
  margin-left: auto;
  margin-right: auto;
}
```



## 字体



在 `_layouts\default.html`

```
---
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="shortcut icon" href="/static/img/favicon.ico"/>
    <link rel="stylesheet" href="https://npm.elemecdn.com/lxgw-wenkai-screen-webfont/style.css" media="print" onload="this.media='all'"> => 添加部分
```

ps: 图床使用的是他人的cdn加速，可能会挂掉



在 `static\css\main.css`

```css
body {
  font-family: "LXGW WenKai Screen","Roboto Condensed", Arial, sans-serif !important;
  background: url("/static/img/subtle_dots.png");
  line-height: 1.5em;
  font-weight: 300;
  font-size: 16px;
  color: #666;
}
```



## 去掉评论

`_layouts\post.html`

注释最后的代码

```
<!-- <div class="disqus-comments">
  <div id="disqus_thread"></div>
  <script type="text/javascript">
    /* <![CDATA[ */
    var disqus_shortname = "{{ site.disqus_shortname }}";
    var disqus_identifier = "{{ site.url }}_{{ page.title }}";
    var disqus_title = "{{ page.title }}";

    /* * * DON'T EDIT BELOW THIS LINE * * */
    (function() {
        var dsq = document.createElement('script'); dsq.type = 'text/javascript'; dsq.async = true;
        dsq.src = '//' + disqus_shortname + '.disqus.com/embed.js';
        (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(dsq);
    })();
    /* ]]> */
  </script>
</div> -->

```



## footer添加天气	

`_layouts\default.html`

```
        <footer>
          <div id="weather-info">
              <p><b> 
                <span>今日天气: </span>
                <span id="weatherData">正在加载今日天气...</span>
                <span  id="weatherTags">正在加载今日天气....</span>
              </b></p>
          <div>
        </footer>
```



修改字体16px `static\css\main.css`

```
footer {
  border-top: 1px solid #F7F1F1;
  width: 100%;
  height: 10px;
  margin-top: 10px;
  margin-bottom: 3em;
  padding-top: 10px;
  color: #C2C2C2;
  font-size: 16px;
  bottom: 0;
  padding-bottom: 10px;
}
```





## site.about修改诗词

`_layouts\default.html`

```
          <h1 class="author-name">{{ site.author }}</h1>
          {% if site.about %}
            <div class="profile-about">
              {{ site.about }}
            </div>
          {% endif %}
```

修改为

```
          <h1 class="author-name">&copy; {{ site.author }}</h1>
          <p class="jrsc-info"><b> 
            <span>今日诗词: </span>
            <span class="jinrishici-sentence">正在加载今日诗词....</span>
          </b></p>
```



## 去掉share功能

```
<div class="content">
  <div class="post">{{ content }}</div>
  <!-- {% include share-page.html %} -->注释
</div>
```



## 添加评论Gitalk

参考 

- [Gitalk博客评论插件](https://tyzhang.top/article/gitalk/),
- [为你的jekyll博客添加gitalk评论插件吧！,](https://blog.csdn.net/weixin_44235031/article/details/104480371)
- [Gitalk博客评论插件](https://tyzhang.top/article/gitalk/)



[Register a new OAuth application](https://github.com/settings/applications/new)



`_congfig.yml`

```
# Gitalk  评论功能
gitalk: 
  enable: true    #是否开启Gitalk评论
  clientID: ***    #生成的clientID，下面会讲
  clientSecret: *** #生成的clientSecret
  repo: redqx.github.io    #仓库名称
  owner: redqx    #github用户名
  admin: redqx
  distractionFreeMode: false #是否启用类似FB的阴影遮罩
```



`\_layouts\post.html`

```
{% if site.gitalk.enable %}
<!-- Gitalk 评论 start  -->
<style>
    .markdown-body {
        font-family: "LXGW WenKai Screen","Roboto Mono", "monospace", sans-serif !important;
    }
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/gitalk@1/dist/gitalk.css">
<script src="https://cdn.jsdelivr.net/npm/gitalk@1/dist/gitalk.min.js"></script>
<div id="gitalk-container"></div>
<script type="text/javascript">
  var title = location.pathname.substr(0, 50);
  var gitalk = new Gitalk({
    clientID: '{{site.gitalk.clientID}}',
    clientSecret: '{{site.gitalk.clientSecret}}',
    repo: '{{site.gitalk.repo}}',
    owner: '{{site.gitalk.owner}}',
    admin: ['{{site.gitalk.admin}}'],
    id: title,
    distractionFreeMode: false 
  });
  gitalk.render('gitalk-container');
</script>
{% endif %}
<!-- Gitalk end -->
```



## 文章加密

参考[Jekyll也可以加密文章啦！](https://mabbs.github.io/2019/06/11/encrypt.html)
