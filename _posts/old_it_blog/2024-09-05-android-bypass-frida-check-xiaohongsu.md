---
layout: post
title:  "绕过 xiaohongsu frida检测"
categories: [android] 
---



# v8.31.0

wp: [绕过最新版bilibil1 app反frida机制](https://blog.csdn.net/wei_java144/article/details/139179629)

xiaohongsu

官方版本号：[v8.31.0] 

更新时间：2024年04月16日 14:55

apk附件: 链接: https://pan.baidu.com/s/1od3baKWjqzbyOHTdBy6zyQ?pwd=6s8d 提取码: 6s8d

## way1 修改dlsym(xx,"pthread_create")返回值



分析环境

```
Android10
Frida 16.3.3 
xiaohongsu v8.31.0
```



第一次尝试frida注入, 直接退出

```
λ frida -U -f com.xingin.xhs
     ____
    / _  |   Frida 16.3.3 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to PBCM10 (id=1d518c72)
Spawned `com.xingin.xhs`. Resuming main thread!
[PBCM10::com.xingin.xhs ]-> Process terminated
[PBCM10::com.xingin.xhs ]->

Thank you for using Frida!

```



查看加载了什么so

```js
function hook_dlopen() {
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function (args) {
                var pathptr = args[0];
                if (pathptr !== undefined && pathptr != null) {
                    var path = ptr(pathptr).readCString();
                    console.log("load " + path);
                }
            }
        }
    );
}

console.log("\nHi, I am frida!");
hook_dlopen();
/*
λ frida -U -f com.qiyi.video -l asset\f1.js
     ____
    / _  |   Frida 16.3.3 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to PBCM10 (id=1d518c72)
Spawning `com.qiyi.video`...

Hi, I am frida!
Spawned `com.qiyi.video`. Resuming main thread!
[PBCM10::com.qiyi.video ]-> load /system/framework/oat/arm/android.test.mock.odex
load /system/framework/oat/arm/org.apache.http.legacy.odex
load /system/framework/oat/arm/android.test.runner.odex
load /data/app/com.qiyi.video-lJqQFY---WMn8DLowc8W5g==/oat/arm/base.odex
load /data/app/com.qiyi.video-lJqQFY---WMn8DLowc8W5g==/lib/arm/libmmkv.so
load /data/app/com.qiyi.video-lJqQFY---WMn8DLowc8W5g==/lib/arm/libxcrash.so
load /data/app/com.qiyi.video-lJqQFY---WMn8DLowc8W5g==/lib/arm/libmsaoaidsec.so
Process terminated
[PBCM10::com.qiyi.video ]->

Thank you for using Frida!
*/
```

和之前分析的bilibil1有点类似, 都是用的libmsaoaidsec.so来检测

libmsaoaidsec.so没有导入`pthread_create`

我们看谁调用了pthread_create, 看看是否可以继续nop

```js
function hook_pthread_create() 
{
    console.log("start hook pthread_create")
    var interceptor = Interceptor.attach(Module.findExportByName("libc.so", "pthread_create"),
            {
                onEnter: function (args) {
                    var module = Process.findModuleByAddress(ptr(this.returnAddress))
                    if (module != null) {
                        console.log("[pthread_create] called from", module.name)
                    }
                    else {
                        console.log("[pthread_create] called from", ptr(this.returnAddress))
                    }
                },
            }
    )
}
Java.perform(function(){
    console.log("\nHi, I am frida!\n");
    hook_pthread_create();
    //hook_dlopen2("libmsaoaidsec.so");
})
//查不出一个所以然
```

看看是否动态获取了函数`pthread_create`

```js
function hook_dlsym() {
    var count = 0
    console.log("=== HOOKING dlsym ===")
    var interceptor = Interceptor.attach(Module.findExportByName("libc.so", "dlsym"),
        {
            onEnter: function (args) {
                const name = ptr(args[1]).readCString()
                console.log("[dlsym]", name)
            },
        }
    )
    return Interceptor
}
function hook_dlopen2(soName = '') {
    console.log("=== HOOKING android_dlopen_ext ===")
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function (args) {
                var pathptr = args[0];
                if (pathptr !== undefined && pathptr != null) {
                    var path = ptr(pathptr).readCString();
                    if (path.indexOf(soName) >= 0) {
                        console.log(`${path} is loaded`)
                        hook_dlsym();
                    }
                }
            }
        }
    );
}
console.log("\nHi, I am frida!\n");
hook_dlopen2("libmsaoaidsec.so");
/*
λ frida -U -f com.xingin.xhs -l asset\f1.js
     ____
    / _  |   Frida 16.3.3 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to PBCM10 (id=1d518c72)
Spawning `com.xingin.xhs`...

Hi, I am frida!

=== HOOKING android_dlopen_ext ===
Spawned `com.xingin.xhs`. Resuming main thread!
[PBCM10::com.xingin.xhs ]-> /data/app/com.xingin.xhs--J0ejCpadCWO5R8dGEjf_g==/lib/arm64/libmsaoaidsec.so is loaded
=== HOOKING dlsym ===
[dlsym] Java_com_tencent_mars_xlog_Xlog_setConsoleLogOpen
[dlsym] pthread_create
[dlsym] pthread_create
Process terminated
[PBCM10::com.xingin.xhs ]->

Thank you for using Frida!
*/
```

发现获取了2次`pthread_create`

然后尝试hook dlsym返回地址, 让`pthread_create`调用为空

```js
function create_fake_pthread_create() {
    const fake_pthread_create = Memory.alloc(4096)
    Memory.protect(fake_pthread_create, 4096, "rwx")
    Memory.patchCode(fake_pthread_create, 4096, code => {
        const cw = new Arm64Writer(code, { pc: ptr(fake_pthread_create) })
        cw.putRet()
    })
    return fake_pthread_create
}
function hook_dlsym() {
    var count = 0
    console.log("=== HOOKING dlsym ===")
    var fake_pthread_create = create_fake_pthread_create()
    var interceptor = Interceptor.attach(Module.findExportByName(null, "dlsym"),
        {
            onEnter: function (args) {
                const name = ptr(args[1]).readCString()
                console.log("[dlsym]", name)
                if (name == "pthread_create") {
                    count++
                }
            },
            onLeave: function(retval) {
                if (count == 1) {
                    retval.replace(fake_pthread_create)
                }
                else if (count == 2) {
                    retval.replace(fake_pthread_create)
                    // 完成2次替换, 停止hook dlsym
                    interceptor.detach()
                }
                console.log("replace dlsym(\"pthread_create\")")
            }
        }
    )
    return Interceptor
}
function hook_dlopen2(soName = '') {
    console.log("=== HOOKING android_dlopen_ext ===")
    var interceptor = Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function (args) {
                var pathptr = args[0];
                if (pathptr !== undefined && pathptr != null) {
                    var path = ptr(pathptr).readCString();
                    if (path.indexOf(soName) >= 0) {
                        console.log(`${path} is loaded`)
                        hook_dlsym();
                    }
                }
            }
        }
    );
    return interceptor
}

console.log("\nHi, I am frida!\n");
// Java.perform(function(){
//     var dlopen_interceptor = hook_dlopen2("libmsaoaidsec.so");
// })
var dlopen_interceptor = hook_dlopen2("libmsaoaidsec.so");
/*
λ frida -U -f com.xingin.xhs -l asset\f1.js
     ____
    / _  |   Frida 16.3.3 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to PBCM10 (id=1d518c72)
Spawning `com.xingin.xhs`...

Hi, I am frida!

=== HOOKING android_dlopen_ext ===
Spawned `com.xingin.xhs`. Resuming main thread!
[PBCM10::com.xingin.xhs ]-> /data/app/com.xingin.xhs--J0ejCpadCWO5R8dGEjf_g==/lib/arm64/libmsaoaidsec.so is loaded
=== HOOKING dlsym ===
[dlsym] pthread_create
replace dlsym("pthread_create")
[dlsym] Java_com_xingin_httpdns_V2_XYHttpDnsTool_getNativeSupportIpStack
[dlsym] pthread_create
replace dlsym("pthread_create")
*/
```

发现app正常运行

![image-20240905092816506](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240905092816506.png)

## way2 去混淆分析, 置空检测函数

wp: [某书Frida检测绕过记录](https://blog.csdn.net/weixin_45582916/article/details/137973006)

xiaohongsu

官方版本号：[v8.31.0] 

更新时间：2024年04月16日 14:55

apk附件: 链接: https://pan.baidu.com/s/1od3baKWjqzbyOHTdBy6zyQ?pwd=6s8d 提取码: 6s8d



libmsaoaidsec.so的 `void init_proc()`有混淆, 之前的分析处理一直没动它

wp是可以用D810插件解混淆,,,只能说棒极了,,,

如何使用d810, 我看的这个[[IDA Plugin] 反混淆器：D810的安装和使用 #ollvm去平坦化 #D-810](https://www.qlgoo.com/3701/)

解混淆之后,看上去干净多了

```c
void init_proc()
{
  const char *v0; // x23
  __int64 v1; // x0
  unsigned int v2; // w0
  unsigned __int64 StatusReg; // [xsp+0h] [xbp-870h] BYREF
  __int64 *v4; // [xsp+8h] [xbp-868h]
  int v6; // [xsp+18h] [xbp-858h]
  int v7; // [xsp+1Ch] [xbp-854h]
  __int64 *v8; // [xsp+20h] [xbp-850h]
  char *v10; // [xsp+30h] [xbp-840h]
  FILE *v11; // [xsp+38h] [xbp-838h]
  char v12[2000]; // [xsp+40h] [xbp-830h] BYREF
  __int64 v13; // [xsp+810h] [xbp-60h]

  StatusReg = _ReadStatusReg(ARM64_SYSREG(3, 3, 13, 0, 2));
  v13 = *(_QWORD *)(StatusReg + 40);
  v4 = (__int64 *)(&StatusReg - 250);
  *off_47FB8 = sub_123F0();//内部调用了_system_property_get("ro.build.version.sdk", v1);
  sub_12550();
  sub_12440();
  if ( *off_47FB8 > 23 )
    *off_47ED8 = 1;
  if ( (sub_25A48() & 1) == 0 )
  {
    v10 = v12;
    memset(v10, 0, 0x7D0u);
    v2 = getpid();
    _sprintf_chk(v12, 0LL, 2000LL, "/proc/%d/cmdline", v2);
    v11 = fopen(v12, "r");
    if ( v11 )
    {
      v8 = v4;
      memset(v4, 0, 0x7D0u);
      v0 = (const char *)v4;
      fscanf(v11, "%s", v4);
      fclose(v11);
      if ( !strchr(v0, 58) )
        sub_1BEC4();//大概是主要检测函数
    }
    v1 = sub_13728();//初始化JNI_LOAD
    sub_23AD4(v1);
    v6 = sub_C830();
    if ( v6 != 1 || (v7 = sub_95C8()) != 0 )
      sub_9150();
  }
}
```



sub_123F0() 内部第一次调用了`_system_property_get("ro.build.version.sdk", v1)`; 可以作为一个hook时机,

通过分析,认为`sub_1BEC4`是检测函数,我们对他进行替换

```js
function nop_sub_1BEC4() 
{

    console.log("=== start hook sub_1BEC4 ===")
    var module = Process.findModuleByName("libmsaoaidsec.so")
    if (module != null) 
    {
        Interceptor.replace(module.base.add(0x000000000001BEC4), new NativeCallback(function () 
        {
            console.log("sub_1BEC4 was called and replaced")
        }, "void", []))
        console.log("=== hook down ===")
    }
}
function locate_init() {
    console.log("=== start hook __system_property_get ===")
    var lpf__system_property_get = Module.findExportByName(null, "__system_property_get")
    var listener = Interceptor.attach(lpf__system_property_get,
        {
            // _system_property_get("ro.build.version.sdk", v1);
            onEnter: function (args) {
                var name = args[0];
                //secmodule = Process.findModuleByName("libmsaoaidsec.so"); //这里调用会导致卡死, 不知道为什么
                if (name !== undefined && name != null) {
                    name = ptr(name).readCString();
                    //console.log(`call __system_property_get(${name},v1)`);
                    if (name.indexOf("ro.build.version.sdk") >= 0) {
                        // 这是.init_proc刚开始执行的地方，是一个比较早的时机点
                        // do something
                        console.log("call __system_property_get(\"ro.build.version.sdk\", v1)")
                        nop_sub_1BEC4();
                        listener.detach(); //hook 1 次
                    }
                }
            }
        }
    );
}
function hook_dlopen2(soName = '') 
{
    console.log("=== start hook android_dlopen_ext ===")
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function (args) 
            {
                var pathptr = args[0];
                if (pathptr !== undefined && pathptr != null) {
                    var path = ptr(pathptr).readCString();
                    if (path.indexOf(soName) >= 0) {
                        console.log(`${path} is loaded`)
                        locate_init();
                    }
                }
            },
        }
    );
}
console.log("\nhi i am frida")
hook_dlopen2("libmsaoaidsec.so")
/*
λ frida -U -f com.xingin.xhs -l asset\f1.js
     ____
    / _  |   Frida 16.3.3 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to PBCM10 (id=1d518c72)
Spawning `com.xingin.xhs`...

hi i am frida
=== start hook android_dlopen_ext ===
Spawned `com.xingin.xhs`. Resuming main thread!
[PBCM10::com.xingin.xhs ]-> /data/app/com.xingin.xhs--J0ejCpadCWO5R8dGEjf_g==/lib/arm64/libmsaoaidsec.so is loaded
=== start hook __system_property_get ===
call __system_property_get("ro.build.version.sdk", v1)
=== start hook sub_1BEC4 ===
=== hook down ===
sub_1BEC4 was called and replaced
*/ 
```



app正常运行

![image-20240905103142403](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240905103142403.png)