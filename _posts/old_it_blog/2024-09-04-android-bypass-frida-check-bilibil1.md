---
layout: post
title:  "绕过 bilibil1 frida检测"
categories: [android] 
---



# 序言

学习frida绕过



网上对frida的检测通常会使用openat、open、strstr、pthread_create、snprintf、sprintf、readlinkat等一系列函数
pthread_create是一种编程策略(多线程轮询检测,,...), 结合一些api的调用一起发挥作用



# v7.26.1

wp: [[原创]绕过bilibil1 frida反调试](https://bbs.kanxue.com/thread-277034.htm)

bilibil1

官方版本号：v7.26.1

更新时间：2023年04月20日 15:16

apk附件: 链接: https://pan.baidu.com/s/1od3baKWjqzbyOHTdBy6zyQ?pwd=6s8d 提取码: 6s8d

## way1 nop pthread_create()调用



尝试用frida Spawned 启动bilibil1

```
λ frida -U -f tv.danmaku.bili
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
Spawned `tv.danmaku.bili`. Resuming main thread!
[PBCM10::tv.danmaku.bili ]-> Process terminated
[PBCM10::tv.danmaku.bili ]
```

frida注入直接over

具体表现为 frida注入失败, frida-server正常, 哔哩bili进程重启,然后进入正常页面

检测Frida的机制一般在Native层实现，通常会创建几个线程轮询检测, 

首先要知道检测机制是由哪个so实现的，通过hook android_dlopen_ext函数，观察加载到哪个so的时候，触发反调试进程终止即可

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
λ frida -U -f tv.danmaku.bili -l asset\f2.js
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
Spawning `tv.danmaku.bili`...

Hi, I am frida!
Spawned `tv.danmaku.bili`. Resuming main thread!
[PBCM10::tv.danmaku.bili ]-> load /system/framework/oat/arm/com.android.future.usb.accessory.odex
load /system/framework/oat/arm/org.apache.http.legacy.odex
load /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/oat/arm/base.odex
load /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libblkv.so
load /data/data/tv.danmaku.bili/app_tribe/bundles/livestream/1174793300/oat/arm/main.odex
load /data/data/tv.danmaku.bili/app_tribe/bundles/editorimagetxt/1174793300/oat/arm/main.odex
load /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libbili_core.so
load /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libbilicr.88.0.4324.188.so
load /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libijkffmpeg.so
load /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libavif-jni.so
load /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libbtrace.so
load /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libbili.so
load /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libBugly.so
load /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libmsaoaidsec.so
*/
```

呃....发现是32位的so

由so的加载流程可知，当libmsaoaidsec.so被加载之后，frida进程就被杀掉了，因此监测点在`libmsaoaidsec.so`中。

so的加载流程, linker会先对so进行加载与链接，然后调用so的`.init_proc`函数，接着调用`.init_array`中的函数，最后才是`JNI_OnLoad`函数

所以我需要先确定检测点大概在哪个函数中。

如何确定检测点在哪里???

以`libmsaoaidsec.so.JNI_OnLoad`为例,,,如果我们的`JNI_OnLoad`执行了,,说明检测点在`JNI_OnLoad`之后

不然, `JNI_OnLoad`得不到执行

```js
function hook_dlopen2(soName = '') 
{
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function (args) 
            {
                var pathptr = args[0];
                if (pathptr !== undefined && pathptr != null) {
                    var path = ptr(pathptr).readCString();
                    if (path.indexOf(soName) >= 0) {
                        this.is_can_hook = true;
                    }
                }
            },
            onLeave: function (retval) 
            {
                if (this.is_can_hook) 
                {
                    hook_JNI_OnLoad()//只对指定so做hook
                }
            }
        }
    );
}

//如果没被执行,说明检测点在JNMI_OnLoad之前
function hook_JNI_OnLoad()
{
    let module = Process.findModuleByName("libmsaoaidsec.so")
    Interceptor.attach(module.base.add(0xC6DC + 1), { 
        // 拿到libmsaoaidsec.so,用IDA简单分析一下
        //LOAD:0000C6DC ; jint JNI_OnLoad(JavaVM *vm, void *reserved)
        onEnter(args){
            console.log("call JNI_OnLoad")
        }
    })
}
console.log("\nhi i am frida")
hook_dlopen2("libmsaoaidsec.so");
/*
λ frida -U -f tv.danmaku.bili -l asset\f2.js
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
Spawning `tv.danmaku.bili`...

hi i am frida
Spawned `tv.danmaku.bili`. Resuming main thread!
[PBCM10::tv.danmaku.bili ]-> Process terminated
[PBCM10::tv.danmaku.bili ]->

Thank you for using Frida!
*/
```

发现没有输出,,,所以可能在DT_INITARRAY, DT_INIT中

原wp说,,hook linker的call_function并不容易, 所以原wp打算hook `libmsaoaidsec.so=>init_proc()`

在init_proc()函数中

```c
unsigned __int32 *init_proc()
{
  int v0; // r0
  int v1; // r0
  __pid_t v2; // r0
  bool v3; // zf
  int v4; // r0
  int v6[2]; // [sp+0h] [bp-FE0h] BYREF
  int v7; // [sp+8h] [bp-FD8h] BYREF
  int v8; // [sp+Ch] [bp-FD4h]
  char *v9; // [sp+10h] [bp-FD0h]
  FILE *stream; // [sp+14h] [bp-FCCh]
  int v11; // [sp+18h] [bp-FC8h]
  char *v12; // [sp+1Ch] [bp-FC4h]
  char *v13; // [sp+20h] [bp-FC0h]
  bool v14; // [sp+24h] [bp-FBCh]
  char v15[2000]; // [sp+28h] [bp-FB8h] BYREF
  char v16[2024]; // [sp+7F8h] [bp-7E8h] BYREF

  v6[0] = (int)off_1FC04;
  v0 = *(_DWORD *)off_1FC04;
  v6[1] = (int)&v7;
  v7 = v0;
  v8 = sub_B1B4(v0); //内部调用了_system_property_get("ro.build.version.sdk", v1);
  //同时 _system_property_get("ro.build.version.sdk", v1) 也是第一次被调用的地方
  //_system_property_get("ro.build.version.sdk", v1) 为什么是第一次调用的地方? 猜的,后面发现确实是
  v1 = 1558357841;
  while ( 1 )
  {
    while ( 1 )
    {
      while ( 1 )
      {
        while ( 1 )
        {
          while ( v1 <= -76114973 )
          {
            if ( v1 > -307573639 )
            {
              if ( v1 <= -213709866 )
              {
                if ( v1 == -307573638 )
                {
                  v4 = sub_167B0();
                  sub_15F8C(v4);
                  v14 = *off_1FC08 > 23;
                  v1 = 1340489626;
                }
                else
                {
                  v11 = sub_75F0();
                  v1 = 532442294;
                }
                  ......
```

init_proc()的主要检查点在代码`v8 = sub_B1B4(v0);`之后

于是我们以`_system_property_get`作为hook点,

如果_system_property_get函数被调用了，那么这个时候也就是`.init_proc`函数刚刚被调用的时候，在这个时机点可以注入我们想要的代码

我们对pthread_create函数进行hook一下，打印一下新线程要执行的函数地址, 查看是不是在`libmsaoaidsec.so`中

如果在`libmsaoaidsec.so`中,,,说明它多半干了坏事情

```js
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
function locate_init() {
    console.log("=== start hook __system_property_get ===")
    var lpf__system_property_get = Module.findExportByName(null, "__system_property_get")
    Interceptor.attach(lpf__system_property_get,
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
                        hook_pthread_create();
                    }
                }
            }
        }
    );
}

function hook_pthread_create(){
    console.log("=== start hook pthread_create ===")
    var tar_base = Process.findModuleByName("libmsaoaidsec.so").base
    console.log("libmsaoaidsec.so ==> " + tar_base)
    Interceptor.attach(Module.findExportByName("libc.so", "pthread_create"),{
        onEnter(args){
            let func_addr = args[2]
            console.log(`pthread_create(arg0,arg1,${func_addr},arg3); ret2 ${this.returnAddress}`);//
        }
    })
}
console.log("\nhi i am frida")
hook_dlopen2("libmsaoaidsec.so")
/*
λ frida -U -f tv.danmaku.bili -l asset\f2.js
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
Spawning `tv.danmaku.bili`...

hi i am frida
=== start hook android_dlopen_ext ===
Spawned `tv.danmaku.bili`. Resuming main thread!
[PBCM10::tv.danmaku.bili ]-> /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libmsaoaidsec.so is loaded
=== start hook __system_property_get ===
call __system_property_get("ro.build.version.sdk", v1)
=== start hook pthread_create ===
libmsaoaidsec.so ==> 0xb3e59000
pthread_create(arg0,arg1,0xe42f59f5,arg3); ret2 0xe42f6c37
pthread_create(arg0,arg1,0xe42f59f5,arg3); ret2 0xe42f6c37
pthread_create(arg0,arg1,0xe42f59f5,arg3); ret2 0xe42f6c37
pthread_create(arg0,arg1,0xe42f59f5,arg3); ret2 0xe42f6c37
pthread_create(arg0,arg1,0xe42f59f5,arg3); ret2 0xe42f6c37
pthread_create(arg0,arg1,0xb3e6a129,arg3); ret2 0xb3e6a3fd ;恶意线程,在libmsaoaidsec.so中
pthread_create(arg0,arg1,0xb3e69975,arg3); ret2 0xb3e69ae9 ;恶意线程,在libmsaoaidsec.so中
pthread_create(arg0,arg1,0xe42f59f5,arg3); ret2 0xe42f6c37
pthread_create(arg0,arg1,0xe42f59f5,arg3); ret2 0xe42f6c37
Process terminated
[PBCM10::tv.danmaku.bili ]->

Thank you for using Frida!*/
```



去对应地址看看

ps: 地址给我的感觉总是往后移了一位,所以是thumb+arm ???

```
线程1:
线程地址 0x11128
pthread_create调用地址 000113F8
pthread_create返回地址 000113fC


线程2:
线程地址: 00010975 
pthread_create调用地址: 00010AE4
pthread_create返回地址: 00010AE8
```

我们对调用地址进行nop掉,这样会显得比较暴力, nop掉后查看app是否正常运行

```js
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
function locate_init() {
    console.log("=== start hook __system_property_get ===")
    var lpf__system_property_get = Module.findExportByName(null, "__system_property_get")
    var hooked = false
    Interceptor.attach(lpf__system_property_get,
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
                        //hook_pthread_create();//通过hook_pthread_create去获取要bypass的信息
                        if (hooked==false) {
                            console.log("start hook")
                            bypass();
                            hooked = true;
                        }
                        
                    }
                }
            }
        }
    );
}
function hook_pthread_create(){
    console.log("=== start hook pthread_create ===")
    var tar_base = Process.findModuleByName("libmsaoaidsec.so").base
    console.log("libmsaoaidsec.so ==> " + tar_base)
    Interceptor.attach(Module.findExportByName("libc.so", "pthread_create"),{
        onEnter(args){
            let func_addr = args[2]
            console.log(`pthread_create(arg0,arg1,${func_addr},arg3); ret2 ${this.returnAddress}`);//
        }
    })
}
function nop(addr) {
    Memory.patchCode(ptr(addr), 4, code => {
        const cw = new ThumbWriter(code, { pc: ptr(addr) }); // Thumb指令集
        cw.putNop();
        cw.putNop();
        cw.flush();
    });
}

function bypass(){
    let module = Process.findModuleByName("libmsaoaidsec.so")
    nop(module.base.add(0x10AE4))
    nop(module.base.add(0x113F8))
}
console.log("\nhi i am frida")
hook_dlopen2("libmsaoaidsec.so")
/*
λ frida -U -f tv.danmaku.bili -l asset\f2.js
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
Spawning `tv.danmaku.bili`...

hi i am frida
=== start hook android_dlopen_ext ===
Spawned `tv.danmaku.bili`. Resuming main thread!
[PBCM10::tv.danmaku.bili ]-> /data/app/tv.danmaku.bili-emPqw2kMxqVQrZ5WxB5Img==/lib/arm/libmsaoaidsec.so is loaded
=== start hook __system_property_get ===
call __system_property_get("ro.build.version.sdk", v1)
start hook
call __system_property_get("ro.build.version.sdk", v1)
call __system_property_get("ro.build.version.sdk", v1)
*/
```



之后可以看到bilibil1可以成功运行

![image-20240904165216430](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240904165216430.png)



# v7.76.0 

wp: [绕过最新版bilibil1 app反frida机制](https://blog.csdn.net/wei_java144/article/details/139179629)

bilibil1

官方版本号：v7.76.0 

更新时间：2024年04月24日 16:30

apk附件: 链接: https://pan.baidu.com/s/1od3baKWjqzbyOHTdBy6zyQ?pwd=6s8d 提取码: 6s8d

## way1 修改dlsym(xx,"pthread_create")返回地址

不同于`v7.26.1`, 

v7.76.0 的libmsaoaidsec.so没有导入`pthread_create`

所以无法通过nop掉pthread_create调用来解决问题

那我们查看谁调用了pthread_create, 看看是否可以继续nop

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
/*
λ frida -U -f tv.danmaku.bili -l asset\f2.js
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
Spawned `tv.danmaku.bili`. Resuming main thread!
[PBCM10::tv.danmaku.bili ]->
Hi, I am frida!
start hook pthread_create
[pthread_create] called from libart.so
[pthread_create] called from libart.so
[pthread_create] called from libart.so
[pthread_create] called from libbilicr.88.0.4324.188.so

[pthread_create] called from libart.so
[pthread_create] called from libbilicr.88.0.4324.188.so
[pthread_create] called from libbilicr.88.0.4324.188.so
[pthread_create] called from libbili.so
[pthread_create] called from libart.so
[pthread_create] called from libbilicr.88.0.4324.188.so
[pthread_create] called from libart.so
Process terminated
[PBCM10::tv.danmaku.bili ]->

Thank you for using Frida!
*/
```

没看出一个所以然, 所以不知道libmsaoaidsec.so在哪里调用的`pthread_create`

是不是动态获取的`pthread_create`地址

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
λ frida -U -f tv.danmaku.bili -l asset\f3.js
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
Spawning `tv.danmaku.bili`...

Hi, I am frida!

=== HOOKING android_dlopen_ext ===
Spawned `tv.danmaku.bili`. Resuming main thread!
[PBCM10::tv.danmaku.bili ]-> /data/user/0/tv.danmaku.bili/app_tribe/bundles/oaidkit/1589988300/libs/libmsaoaidsec.so is loaded
=== HOOKING dlsym ===
[dlsym] pthread_create
[dlsym] pthread_create
Process terminated
[PBCM10::tv.danmaku.bili ]->

Thank you for using Frida!
*/
```

发现获取了2次pthread_create

调用pthread_create多半是在干坏事,,所以拒绝调用...

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
λ frida -U -f tv.danmaku.bili -l asset\f3.js
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
Spawning `tv.danmaku.bili`...

Hi, I am frida!

=== HOOKING android_dlopen_ext ===
Spawned `tv.danmaku.bili`. Resuming main thread!
[PBCM10::tv.danmaku.bili ]-> /data/user/0/tv.danmaku.bili/app_tribe/bundles/oaidkit/1589988300/libs/libmsaoaidsec.so is loaded
=== HOOKING dlsym ===
[dlsym] pthread_create
replace dlsym("pthread_create")
[dlsym] pthread_create
replace dlsym("pthread_create")
*/
```

然后bilibil1就可以正常运行了

![image-20240904150649685](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240904150649685.png)