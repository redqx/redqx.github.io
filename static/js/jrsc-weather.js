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
        return document.getElementById("weatherData") && document.getElementById('weatherTags');
    }

    // 更新页面中的诗句元素
    function updatePoemContent() 
    {
        //根据数量来设置
        api.load(function (response) 
        {
      var wData = document.getElementById("weatherData");
      var wTags = document.getElementById("weatherTags");
      try
      {
        const region = response.data.region;
        const weatherData = response.data.weatherData;
        const weather_Data2 = region  + " " + weatherData.weather + " " + weatherData.temperature + "℃" ;
        const weather_Tags = response.data.tags;
        wData.innerText = weather_Data2;
        wTags.innerText = " —— " + weather_Tags;
        console.log(weather_Data2);
        console.log(weather_Tags);
      }
      catch(err)
      {
        wData.innerText = " -_- error";
        wTags.innerText = " -_- error";
      }
    });

    }
    function handle_response_data(response)
    {

      var weather_Data2,weather_Tags;
      try{
          const region = response.data.region;
          const weatherData = response.data.weatherData;
          weather_Data2 = region  + " " + weatherData.weather + " " + weatherData.temperature + "℃" ;
          weather_Tags = response.data.tags;
          console.log(weather_Data2);
          console.log(weather_Tags);
      }
      catch
      {
        return "...","...";
      }

      return weather_Data2,weather_Tags;
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
                    console.error("[weather]今日诗词API加载失败，错误原因：" + response.errMessage);
                }
            }
        };
    }

    // 加载诗句数据 + 函数定义
    api.load = function (callback)  //函数定义
    {
    // 如果本地存储有token，则使用存储的token发请求
    fetchPoemData(callback, "https://v2.jinrishici.com/info");
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
