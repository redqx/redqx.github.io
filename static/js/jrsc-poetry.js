/**
 * 今日诗词V2 JS-SDK 1.2.2
 * 今日诗词API 是一个可以免费调用的诗词接口：https://www.jinrishici.com
 */
!(function (global) 
{
    var domReadyCallback, api = {};
    var tokenStorageKey = "jinrishici-token";

    // 判断页面上是否存在显示诗句的元素
    function hasPoemElement() 
    {
        return document.getElementById("jinrishici-sentence") || document.getElementsByClassName("jinrishici-sentence").length > 0;
    }

    // 更新页面中的诗句元素
    function updatePoemContent() 
    {
        //根据数量来设置
        api.load(function (response) 
        {
            var singlePoemElement = document.getElementById("jinrishici-sentence");
            var multiplePoemElements = document.getElementsByClassName("jinrishici-sentence");
            var dataShow = handle_response_data(response);
            if (singlePoemElement) 
            {
                singlePoemElement.innerText = dataShow;
            }

            if (multiplePoemElements.length > 0) 
            {
                for (var i = 0; i < multiplePoemElements.length; i++) 
                {
                    multiplePoemElements[i].innerText = dataShow;
                }
            }
        });
    }
    function handle_response_data(response)
    {

      try{
        var content = response.data.content;
        var author = response.data.origin.author;
        var dynasty = response.data.origin.dynasty;
        var title = response.data.origin.title
        var jrscStr = "\n" + content + "\n —— " + "["+dynasty+"]"+ author + "《"+title+"》";
      }
      catch
      {
        return " wrong: ^_^";
      }

      return jrscStr;
    }
    // 发起HTTP请求并处理响应
    function fetchPoemData(callback, url) 
    {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.withCredentials = true;
        xhr.send();
        xhr.onreadystatechange = function () 
        {
            if (xhr.readyState === 4) 
            {
                var response = JSON.parse(xhr.responseText);
                if (response.status === "success") 
                {
                    callback(response);
                } 
                else 
                {
                    console.error("今日诗词API加载失败，错误原因：" + response.errMessage);
                }
            }
        };
    }

    // 加载诗句数据 + 函数定义
    api.load = function (callback)  //函数定义
    {
        if (global.localStorage && global.localStorage.getItem(tokenStorageKey)) 
        {
            // 如果本地存储有token，则使用存储的token发请求
            fetchPoemData(callback, "https://v2.jinrishici.com/one.json?client=browser-sdk/1.2&X-User-Token=" + encodeURIComponent(global.localStorage.getItem(tokenStorageKey)));
        } 
        else 
        {
            // 如果本地没有存储token，则请求新的token
            fetchPoemData(function (response) 
            {
                global.localStorage.setItem(tokenStorageKey, response.token);
                callback(response);
            }, "https://v2.jinrishici.com/one.json?client=browser-sdk/1.2");
        }
    };

    global.jinrishici = api;

    // 如果页面上存在诗句显示元素，则立即加载诗句
    if (hasPoemElement()) 
    {
        updatePoemContent();
    } 
    else 
    {
        // 如果页面加载过程中没有诗句元素，监听DOM加载完成后再执行
        domReadyCallback = function () 
        {
            if (hasPoemElement()) 
            {
                updatePoemContent();
            }
        };

        if (document.readyState !== "loading") 
        {
            domReadyCallback();
        } 
        else if (document.addEventListener) 
        {
            document.addEventListener("DOMContentLoaded", domReadyCallback);
        } 
        else 
        {
            document.attachEvent("onreadystatechange", function () 
            {
                if (document.readyState === "complete") 
                {
                    domReadyCallback();
                }
            });
        }
    }
})(window);
