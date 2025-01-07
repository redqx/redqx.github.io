---
layout: post
title:  "绕过 aiqiy1 frida检测"
categories: [android] 
---



# v15.2.5

aiqiy1

官方版本号：v15.2.5 -arm32版本

更新时间：2024年02月28日 14:35

oppo r15 Android 10





## way1 置空检测函数

wp: [Android安全-绕过爱奇艺新版libmsaoaidsec.so Frida检测](https://bbs.kanxue.com/thread-280754.htm)

原文章的环境是 v15.2.5 -arm64版本, 我下载的arm32



首先直接注入,失败告终

```
λ frida -U -f com.qiyi.video
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
Spawned `com.qiyi.video`. Resuming main thread!
[PBCM10::com.qiyi.video ]-> Process terminated
[PBCM10::com.qiyi.video ]->

Thank you for using Frida!
```



按照wp的方法, 

用frida 启动app, 

但是我没有去sleep,感觉那样有点麻烦(主要是没sleep成功,QAQ)

```
λ frida -U -f com.qiyi.video --pause
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
Spawned `com.qiyi.video`. Use %resume to let the main thread start executing!
[PBCM10::com.qiyi.video ]->
```

此刻,frida已经成功attach,然后detach. 于是strace后续才可与正常的ptrace

我们先观察一下模块的布局(模块好多,woc)

ps: 主要是观察libc.so的范围

```
PBCM10:/data/local/tmp # ps -A | grep "com.qiyi.video"
u0_a173      12210  1809 1996344  31936 futex_wait_queue_me ca7aaae0 S com.qiyi.video
PBCM10:/data/local/tmp # cat /proc/12210/maps
...
eefc2000-eefeb000 r--p 00000000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
eefeb000-ef014000 r-xp 00029000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef014000-ef015000 rwxp 00052000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef015000-ef018000 r-xp 00053000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef018000-ef01c000 rwxp 00056000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef01c000-ef020000 r-xp 0005a000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef020000-ef022000 rwxp 0005e000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef022000-ef054000 r-xp 00060000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef054000-ef055000 rwxp 00092000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef055000-ef061000 r-xp 00093000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef061000-ef063000 rwxp 0009f000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef063000-ef066000 r-xp 000a1000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef066000-ef067000 rwxp 000a4000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef067000-ef06e000 r-xp 000a5000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef06e000-ef070000 rw-p 000ac000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef070000-ef073000 r--p 000ae000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
...
```

然后用strace 跟踪一下

strace输出如下: 我们让64位的strace跟踪32位的进程

```
PBCM10:/data/local/tmp # ./strace -e trace=process -i -f -p 12210
```

然后让app恢复运行

```
[PBCM10::com.qiyi.video ]-> %resume
```

strace输出如下

```
PBCM10:/data/local/tmp # ./strace -e trace=process -i -f -p 12210
./strace: Process 12210 attached with 15 threads
[pid 12237] [ef05443c] [ Process PID=12237 runs in 32 bit mode. ]
./strace: WARNING: Proper structure decoding for this personality is not supported, please consider building strace with mpers support enabled.
[pid 12235] [ef05443c] [ Process PID=12235 runs in 32 bit mode. ]

...
...略

flags=CLONE_VM|CLONE_FS|CLONE_FILES|CLONE_SIGHAND|CLONE_THREAD|CLONE_SYSVSEM|CLONE_SETTLS|CLONE_PARENT_SETTID|CLONE_CHILD_CLEARTID./strace: Process 12958 attached
, parent_tid=[12958], tls=0xb586649c, child_tidptr=0xb5866238) = 12958
[pid 12958] [ef013dcc] exit(0)          = ?
[pid 12958] [????????] +++ exited with 0 +++
[pid 12959] [ef013dcc] exit(0)          = ?
[pid 12959] [????????] +++ exited with 0 +++
[pid 12961] [017df00c] exit_group(0)    = ?  
[pid 12962] [????????] +++ exited with 0 +++
[pid 12960] [????????] +++ exited with 0 +++
[pid 12957] [????????] +++ exited with 0 +++
[pid 12956] [????????] +++ exited with 0 +++
[pid 12955] [????????] +++ exited with 0 +++
[pid 12954] [????????] +++ exited with 0 +++
[????????] +++ exited with 0 +++
PBCM10:/data/local/tmp #
```

在输出内容中我们可以看到

```
[pid 12961] [017df00c] exit_group(0)    = ?  
```

其中`exit_group`的调用并不在libc的模块中, libc的范围是`0xeefc2000 ~ ef073000`

另外 `exit_group`是syscall的调用,,,无法被hook

wp猜测, `exit_group`的代码是动态分配出来的(通过mmap)

动态释放代码一定是要操作内存的，接下来我们用前面相同的逻辑，用strace查看调用了哪些和内存相关的系统调用

按照之前的流程再来一遍....

```
frida -U -f com.qiyi.video --pause
ps -A | grep "com.qiyi.video"
```

看进程

```
PBCM10:/ # cat /proc/25947/maps | grep "libc.so"
ef647000-ef670000 r--p 00000000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef670000-ef699000 r-xp 00029000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef699000-ef69a000 rwxp 00052000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef69a000-ef69d000 r-xp 00053000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef69d000-ef6a1000 rwxp 00056000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6a1000-ef6a5000 r-xp 0005a000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6a5000-ef6a7000 rwxp 0005e000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6a7000-ef6d9000 r-xp 00060000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6d9000-ef6da000 rwxp 00092000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6da000-ef6e6000 r-xp 00093000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6e6000-ef6e8000 rwxp 0009f000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6e8000-ef6eb000 r-xp 000a1000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6eb000-ef6ec000 rwxp 000a4000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6ec000-ef6f3000 r-xp 000a5000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6f3000-ef6f5000 rw-p 000ac000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
ef6f5000-ef6f8000 r--p 000ae000 103:21 264                               /apex/com.android.runtime/lib/bionic/libc.so
```

strace调试一下,然后关注下面的输出内容

```
./strace -e trace=process,memory -i -f -p 25947
...
[pid 20949] [0000007f24090b18] munmap(0x7f2551c000, 4096) = 0
[pid 20949] [0000007f240901f8] exit_group(0) = ?
...
[pid 20962] [ef6d93f8] <... mmap2 resumed>) = 0x1791000
[pid 20962] [0179100c] <... exit_group resumed>) = ?
...
```

其中可以发现exit_group的代码调用地址是被mmap分配出来的

因为地址`[0179100c] <exit_group>`在函数` <.mmap2 resumed> = 0x1791000`的返回地址中

由mmap的调用地址可以看出mmap是libc.so中的函数，于是我们可以hook mmap返回地址

ps: 是为了查看libmsaoaidsec.so有没有调用mmap

我用下面这个脚本执行了一下

```js
function hook_mmap() 
{
    console.log("start hook mmap")
    console.log("libmsaoaidsec.so :" + Module.getBaseAddress("libmsaoaidsec.so"));
    var interceptor = Interceptor.attach(Module.findExportByName("libc.so", "mmap"),
            {
                onEnter: function (args) 
                { 
                    //var module = Process.findModuleByAddress(ptr(this.returnAddress))
                    // if (module != null) {
                    //     console.log("[mmap] called from", module.name)
                    // }
                    // else {
                    //     console.log("[mmap] called from", ptr(this.returnAddress))
                    // }
                    console.log("[mmap] called from", ptr(this.returnAddress))
                },
            }
    )
}
function hook_exit() //failed
{
    console.log("start hook exit")
    var interceptor = Interceptor.attach(Module.findExportByName("libc.so", "exit"),
            {
                onEnter: function (args) 
                { 
                    console.log("[exit] called from", ptr(this.returnAddress))
                },
            }
    )
}
function hook_exit_group_syscall() //failed
{
    console.log("start hook syscall(exit_group)");
}
function hook_dl__ZN6soinfo17call_constructorsEv(){
    //int __fastcall _dl__ZN6soinfo17call_constructorsEv(int a1)
    console.log("=== HOOKING dl__ZN6soinfo17call_constructorsEv ===");
    //local_env android10 x86
    var linker_base = Module.findBaseAddress("linker").add(0x0003185C + 1);
    
    var interceptor = Interceptor.attach(linker_base, {
        onEnter: function (args) {
            console.log("call_constructors enter")
            hook_mmap();
            //hook_exit_group();
            //hook_exit();
            interceptor.detach();
        }
    })
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
                        //hook_mmap();
                        hook_dl__ZN6soinfo17call_constructorsEv();
                    }
                }
            }
        }
    );
}
function hook_dlopen() {
    console.log("=== HOOKING android_dlopen_ext ===")
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function (args) {
                var pathptr = args[0];
                if (pathptr !== undefined && pathptr != null) {
                    var path = ptr(pathptr).readCString();
                    console.log(`${path} is loaded`);
                    //hook_dl__ZN6soinfo17call_constructorsEv();
                }
            }
        }
    );
}
console.log("\nHi, I am frida!\n");
//hook_dlopen();
hook_dlopen2("libmsaoaidsec.so");
/*
λ frida -U -f com.qiyi.video -l asset\f3.js
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

=== HOOKING android_dlopen_ext ===
Spawned `com.qiyi.video`. Resuming main thread!
[PBCM10::com.qiyi.video ]-> /data/app/com.qiyi.video-lJqQFY---WMn8DLowc8W5g==/lib/arm/libmsaoaidsec.so is loaded
=== HOOKING dl__ZN6soinfo17call_constructorsEv ===
call_constructors enter
start hook mmap
libmsaoaidsec.so :0xb6609000
start hook exit
[mmap] called from 0xef69ceff
[mmap] called from 0xb6618feb
[mmap] called from 0xef6e918b
[mmap] called from 0xef6e918b
[mmap] called from 0xee1aafa9
[mmap] called from 0xef6e918b
[mmap] called from 0xef6e8fb9
[mmap] called from 0xef6e8fb9
[mmap] called from 0xef6e8fb9
[mmap] called from 0xee1aafa9
[mmap] called from 0xee1aafa9
[mmap] called from 0xef6e918b
[mmap] called from 0xef68f5bd
[mmap] called from 0xef68f5bd
[mmap] called from 0xef6e8fb9
Process terminated
[PBCM10::com.qiyi.video ]->
*/
```

发现特殊的数据

```
libmsaoaidsec.so :0xb6609000
[mmap] called from 0xb6618feb
```

所以libmsaoaidsec.so调用了mmap

之后我们的exit_group会执行在mmap的内存中....

无奈的是....我目前还不会hook syscall, 无法亲眼看到syscalll是在mmap的内存中执行的

另外,,,,..我发现,,,`aiqiyi_v15.2.5.apk`解压缩后lib目录中并不存在`libmsaoaidsec.so`

```
└── armeabi-v7a
    ├── libavmdl_lite.so
    ├── libbytehook.so
	...
    ├── libxglleak.so
    ├── libxleakjni.so
    ├── libxutils.so
    ├── libyoga.so
    └── libzoom_image_engine_lite.so
```

同时app加载so的路径是

```
...
/data/app/com.qiyi.video-lJqQFY---WMn8DLowc8W5g==/lib/arm/libmsaoaidsec.so is loaded
...
```

所以libmsaoaidsec.so在lib的arm目录中,,,,估计是运行中放进去的,然后加载

于是我们找到so文件, 拖入IDA,找到mmap调用的位置 0xb6618feb - 0xb6609000

![image-20240907213430292](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240907213430292.png)

于是查看一下sub_FF9C的函数调用栈,看一下调用过程

```js
function hook_SUB_FF9C() 
{
    console.log("start hook int __fastcall SUB_FF9C(void **a1, const char *a2)")   ; 
    var interceptor = Interceptor.attach(Module.getBaseAddress("libmsaoaidsec.so").add(0x0000FF9C + 1),
            {
                onEnter: function (args) 
                { 
                    console.log('backtrace');
                    console.log(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n') + '\n');
                },
            }
    )
}
function hook_dl__ZN6soinfo17call_constructorsEv(){
    //int __fastcall _dl__ZN6soinfo17call_constructorsEv(int a1)
    console.log("=== HOOKING dl__ZN6soinfo17call_constructorsEv ===");
    //local_env android10 x86
    var linker_base = Module.findBaseAddress("linker").add(0x0003185C + 1);
    
    var interceptor = Interceptor.attach(linker_base, {
        onEnter: function (args) {
            console.log("call_constructors enter")
            hook_SUB_FF9C();
            //hook_exit_group();
            interceptor.detach();
        }
    })
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
                        hook_dl__ZN6soinfo17call_constructorsEv();
                    }
                }
            }
        }
    );
}
function hook_dlopen() {
    console.log("=== HOOKING android_dlopen_ext ===")
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function (args) {
                var pathptr = args[0];
                if (pathptr !== undefined && pathptr != null) {
                    var path = ptr(pathptr).readCString();
                    console.log(`${path} is loaded`);
                    //hook_dl__ZN6soinfo17call_constructorsEv();
                }
            }
        }
    );
}
console.log("\nHi, I am frida!\n");
//hook_dlopen();
hook_dlopen2("libmsaoaidsec.so");
/*
λ frida -U -f com.qiyi.video -l asset\f3.js
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

=== HOOKING android_dlopen_ext ===
Spawned `com.qiyi.video`. Resuming main thread!
[PBCM10::com.qiyi.video ]-> /data/app/com.qiyi.video-lJqQFY---WMn8DLowc8W5g==/lib/arm/libmsaoaidsec.so is loaded
=== HOOKING dl__ZN6soinfo17call_constructorsEv ===
call_constructors enter
start hook int __fastcall SUB_FF9C(void **a1, const char *a2)
backtrace
0xb65d3423 libmsaoaidsec.so!0x10423
0xb65d5c01 libmsaoaidsec.so!0x12c01
0xb65d5109 libmsaoaidsec.so!0x12109
0xb65d5289 libmsaoaidsec.so!0x12289
0xb65d0259 libmsaoaidsec.so!_init+0x19c
0xf2c47a23
0xf2c37a55
*/
```

根据这个调用栈,,,,我们就可以从`libmsaoaidsec.so`的`.init_proc`出发

```
init_proc()
->sub_12244
->sub_11E60
->sub_12AC0
->sub_103C8
->sub_FF9C
->mmap
....exit_group
```

那我们就学着wp的模样,把sub_11E60函数给置空

```js
function hook_sub_11E60() 
{
    console.log("=== HOOKING sub_11E60 ===")
    Interceptor.replace(Module.findBaseAddress("libmsaoaidsec.so").add(0x11E60 + 1), new NativeCallback(function () {
        console.log(`hook_sub_11E60 >>>>>>>>>>>>>>>>> replace`)
    }, 'void', []));
}
function whatch_sub_11E60() 
{
    
    var tar_ptr = Module.findBaseAddress("libmsaoaidsec.so").add(0x11E60+1);
    console.log("=== whatch sub_11E60 ===: " + tar_ptr);
    Interceptor.attach(tar_ptr, {
        onEnter: function (args) {
            console.log(`whatch_sub_11E60 >>>>>>>>>>>>>>>>> onEnter`)
        },
        onLeave: function (retval) {
            console.log(`whatch_sub_11E60 >>>>>>>>>>>>>>>>> onLeave`)
        }
    });
}

function hook_dl__ZN6soinfo17call_constructorsEv(){
    //int __fastcall _dl__ZN6soinfo17call_constructorsEv(int a1)
    console.log("=== HOOKING dl__ZN6soinfo17call_constructorsEv ===");
    //local_env oppor15 android10 x86
    var linker_base = Module.findBaseAddress("linker").add(0x0003185C + 1);//要不要+1
    
    var interceptor = Interceptor.attach(linker_base, {
        onEnter: function (args) {
            console.log("call_constructors enter")
            hook_sub_11E60();
           // whatch_sub_11E60() ;
            interceptor.detach();
        }
    })
}

function hook_dlopen2(soName = '') {
    
    
    console.log("=== HOOKING android_dlopen_ext ===");
    var tar_ptr = Module.findExportByName(null, "android_dlopen_ext");
    var interceptor = Interceptor.attach(tar_ptr,
        {
            onEnter: function (args) {
                var pathptr = args[0];
                if (pathptr !== undefined && pathptr != null) {
                    var path = ptr(pathptr).readCString();
                    if (path.indexOf(soName) >= 0) {
                        console.log(`${path} is loaded`)
                        hook_dl__ZN6soinfo17call_constructorsEv();
                        interceptor.detach();
                    }
                }
            }
        }
    );
}
console.log("\nHi, I am frida!\n");
//hook_dlopen();
hook_dlopen2("libmsaoaidsec.so");
/*
λ frida -U -f com.qiyi.video -l asset\f3.js
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

=== HOOKING android_dlopen_ext ===
Spawned `com.qiyi.video`. Resuming main thread!
[PBCM10::com.qiyi.video ]-> /data/app/com.qiyi.video-lJqQFY---WMn8DLowc8W5g==/lib/arm/libmsaoaidsec.so is loaded
=== HOOKING dl__ZN6soinfo17call_constructorsEv ===
call_constructors enter
=== HOOKING sub_11E60 ===
hook_sub_11E60 >>>>>>>>>>>>>>>>> replace
*/
```

然后app正常运行

![image-20240907224725580](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240907224725580.png)



> 最后: 

不同于文章 [绕过x1aoh0ngshu frida反调试-文章复现](https://redqx.space/android/2024/09/04/android-bypass-frida-check-xiaohongsu.html),[绕过bilibil1 frida反调试-文章复现](https://redqx.space/android/2024/09/03/android-bypass-frida-check-bilibil1.html)

文章 [Android安全-绕过爱奇艺新版libmsaoaidsec.so Frida检测](https://bbs.kanxue.com/thread-280754.htm)的分析过程很细致,比较有逻辑

同时通过该文章,,认识了strace使用,以及frida的一些新用法

## way2 替换dlsym返回值

参考之前的方法

[绕过x1aoh0ngshu frida反调试-文章复现](https://redqx.space/android/2024/09/04/android-bypass-frida-check-xiaohongsu.html)

[绕过bilibil1 frida反调试-文章复现](https://redqx.space/android/2024/09/03/android-bypass-frida-check-bilibil1.html)



app通过dlsym动态获取了pthread_create

我们尝试修改返回值,执行一个空函数

```js
function create_fake_pthread_create() {
    const fake_pthread_create = Memory.alloc(4096)
    Memory.protect(fake_pthread_create, 4096, "rwx")
    Memory.patchCode(fake_pthread_create, 4096, code => {
        const cw = new ArmWriter(code, { pc: ptr(fake_pthread_create) })
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

=== HOOKING android_dlopen_ext ===
Spawned `com.qiyi.video`. Resuming main thread!
[PBCM10::com.qiyi.video ]-> /data/app/com.qiyi.video-lJqQFY---WMn8DLowc8W5g==/lib/arm/libmsaoaidsec.so is loaded
=== HOOKING dlsym ===
[dlsym] pthread_create
replace dlsym("pthread_create")
[dlsym] pthread_create
replace dlsym("pthread_create")
*/
```

之后app正常运行

![image-20240905150325324](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240905150325324.png)
