---
layout: post
title:  "frida svc hook learn"
categories: [android,reverse-analysis] 
---



# 序言

最近在复现一些frida绕过的文章, 遇到一些hook 的问题 --- syscall系统调用无法直接被hook

于是前来学习一下



> 参考文章



[Frida-syscall-interceptor](https://bbs.kanxue.com/thread-268086.htm)

[Android环境下Seccomp对系统调用的监控](https://blog.lleavesg.top/article/Android-Seccomp)

[SVC的TraceHook沙箱的实现&无痕Hook实现思路](https://bbs.kanxue.com/thread-273160.htm)

[分享一个Android通用svc跟踪以及hook方案——Frida-Seccomp](https://bbs.kanxue.com/thread-271815.htm)

[基于seccomp+sigaction的Android通用svc hook方案 ](https://bbs.kanxue.com/thread-277544.htm)

win-pc: https://passthehashbrowns.github.io/detecting-direct-syscalls-with-frida



> 成品项目



https://github.com/LLeavesG/Frida-Sigaction-Seccomp

https://github.com/Abbbbbi/Frida-Seccomp

https://github.com/xiaotujinbnb/ptrace-seccomp-demo



> 相关项目

https://github.com/proot-me/proot





　　众所周知，目前各大APP的安全模块几乎都会使用自实现的libc函数，如open，read等函数，通过自实现svc方式来实现系统调用。因此我们如果想要hook系统调用，只能通过扫描厂商自实现的代码段，定位svc指令所在地址，再通过inline hook方式来进行hook操作，但是这种方式（麻烦）需要涉及内存修改，很容易被检测到内存篡改行为。



什么是svc调用?

就我的有限认知来说, linux x86_64下, 使用汇编去调用系统api,可以直接使用syscall指令,然后就会进入内核层

汇编代码类似于这样

```assembly
    ; 调用 sys_open
    mov rax, 2          ; sys_open 的系统调用号是 2
    mov rdi, filename   ; 第一个参数：文件名
    mov rsi, 0          ; 第二个参数：flags (O_RDONLY)
    syscall              ; 执行系统调用
```

但是在arm的cpu架构下,用的不是syscall,而是svc指令

```assembly
raw_syscall_32:
        MOV             R12, SP
        STMFD           SP!, {R4-R7}
        MOV             R7, R0
        MOV             R0, R1
        MOV             R1, R2
        MOV             R2, R3
        LDMIA           R12, {R3-R6}
        SVC             0
        LDMFD           SP!, {R4-R7}
        mov             pc, lr
raw_syscall_64:
        MOV             X8, X0
        MOV             X0, X1
        MOV             X1, X2
        MOV             X2, X3
        MOV             X3, X4
        MOV             X4, X5
        MOV             X5, X6
        SVC             0
        RET
```

ps: 有一个C函数叫syscall,  它是对(syscall,svc)的封装



# (一), ptrace监控系统调用

`ptrace`是调试器的核心调用API

我们可以使用ptrace,并配置相关参数来实现系统调用syscall监控



见代码(含注释) -> [1.ptrace_syscall_linux_amd64](https://github.com/redqx/attachment/tree/master/svc-learn/1.ptrace_syscall_linux_amd64) 建议看代码

代码的执行流程和原理:

1), 父进程Afork出一个子进程B,

子进程执行逻辑

```c
//子进程
ptrace(PTRACE_TRACEME, 0, NULL, NULL);
kill(getpid(), SIGSTOP);//当前进程停止,然后给子进程发信号SIGSTOP
//attack();
syscall(SYS_getpid, SYS_mkdir, "dir", 0777);//这样写看上去是错误的,参数只能有一个系统调用,但是父进程会修复该调用
//上面的调用会被修复为 syscall(SYS_mkdir, "dir", 0777);//mkdir ./dir
```

2), 父进程的debug逻辑

先说一下 `ptrace(PTRACE_SYSCALL, pid, NULL, NULL);`

该代码的意思是让子进程继续执行，直到它到达下一个系统调用触发.

触发异常后, 此时进程B的rax寄存器是一个调用的检测状态,检测该调用是否可以调用成功 (乱说的)

然后B的regs.orig_rax是原始的调用号

子进程执行`syscall(SYS_getpid, SYS_mkdir, "dir", 0777)`不仅会触发syscall调用的异常,同时还是一个有问题的调用

于是父进程捕获后,修改调用的参数,实现的效果就是`syscall( SYS_mkdir, "dir", 0777);`

```c
        if (regs.rax != -ENOSYS)
        {
			printf("[F]: normal syscall id(orig_rax) %lld\n", regs.orig_rax);
            continue;//正常的调用,放行
        }

		printf("[F]: exception syscall id(orig_rax) = %lld\n", regs.orig_rax);//进入内核时的原始系统调用号,即将执行的系统调用号
		//异常调用
        if (regs.orig_rax == SYS_getpid)//只处理我们自己故意做出的sys_getpid异常
        {
			//把syscall(SYS_getpid, SYS_mkdir, "dir", 0777)
			//变为syscall(SYS_mkdir, "dir", 0777)执行
            regs.orig_rax = regs.rdi;
            regs.rdi = regs.rsi;
            regs.rsi = regs.rdx;
            regs.rdx = regs.r10;
            regs.r10 = regs.r8;
            regs.r8 = regs.r9;
            regs.r9 = 0;//参数往上移动
            ptrace(PTRACE_SETREGS, pid, NULL, &regs);
        }
```





执行情况

```
┌──(kali㉿G16-7620)-[~/github/redqx/attachment/1.ptrace_syscall_linux_amd64]
└─$ gcc demo.c -o demo.elf

┌──(kali㉿G16-7620)-[~/github/redqx/attachment/1.ptrace_syscall_linux_amd64]
└─$ ./demo.elf
[F]: F9
[F]: exception syscall id(orig_rax) = 39 //getpid
[F]: F9
[F]: normal syscall id(orig_rax) 83 //mkdir
[F]: F9
[F]: exception syscall id(orig_rax) = 231 //exit group
[F]: F9
Unexpected wait status 0
```



最关键的步骤就是`ptrace(PTRACE_SYSCALL, pid, NULL, NULL);` 跟踪系统调用



# (二), 什么是Seccomp



Seccomp是一个Linux内核安全模块，它可以使进程限制可以进行的系统调用数量，从而提高进程的安全性和可靠性。Seccomp提供了一种轻量级的进程隔离方式，可以在限制进程的能力的同时，不会影响操作系统的整体功能，是现代容器和虚拟化技术中广泛使用的安全保障机制之一。

Seccomp的主要工作流程是通过在进程中使用`prctl()`系统调用来指定一个过滤规则集，该规则集称为“过滤器”，它定义了该进程允许使用的系统调用类型和参数。当进程调用系统调用时，过滤器会拦截该调用并进行验证，以判断其是否符合规则集中指定的条件。如果系统调用不符合规则，Seccomp将拒绝该操作，并终止进程。

过滤规则集可以通过指定的宏来实现,类似于手写规则或者汇编代码. 

具体可以查看文章 [基于seccomp+sigaction的Android通用svc hook方案](https://bbs.kanxue.com/thread-277544.htm), [**Android环境下Seccomp对系统调用的监控**](https://blog.lleavesg.top/article/Android-Seccomp#4ee18fd582484dc0b84751e63284f8eb) 的描述



配置 Seccomp 大概如下

```c
void configure_seccomp()
{
    struct sock_filter filter[] =
        {
            BPF_STMT(BPF_LD | BPF_W | BPF_ABS, (offsetof(struct seccomp_data, nr))),
            // 从 seccomp 数据中读取当前被调用的系统调用号
            BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_openat, 0, 2),
            // 比较上一步加载的系统调用号与 __NR_openat 是否相等
            // 相等的话,继续往下执行,跳转0行
            // 不相等,跳转2行,SECCOMP_RET_ALLOW允许执行
            BPF_STMT(BPF_LD | BPF_W | BPF_ABS, (offsetof(struct seccomp_data, args[2]))),
            // 读取arg2
            BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, O_RDONLY, 0, 1),
            // arg2是不是O_RDONLY
            // 如果是,跳转0行,则SECCOMP_RET_ALLOW允许执行
            // 如果不是,则跳转1行,SECCOMP_RET_KILL进程终止
            BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
            BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL)};
    struct sock_fprog prog = {
        .len = (unsigned short)(sizeof(filter) / sizeof(filter[0])),
        .filter = filter,
    };

    printf("Configuring seccomp\n");
    prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0);
    prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog);
}
```

ps: 一开始很难看懂,后来囫囵吞枣只看最后几个字段,发现大概就可以看懂了



一个 Seccomp的代码例子,加深对Seccomp的理解 ==> [2.seccomp_linux_amd64 ](https://github.com/redqx/attachment/tree/master/svc-learn/2.seccomp_linux_amd64)建议看代码

该代码的作用是复制文件,类似于 `cp ./A ./B`,  然后我们监控 `__NR_opena`系统调用

但是我们的规则是拒绝写入,只能读取, 所以会cp失败

输出

```
┌──(kali㉿G16-7620)-[~/github/redqx/attachment/svc-learn/2.seccomp_linux_amd64]
└─$ gcc demo.c -o demo.elf

┌──(kali㉿G16-7620)-[~/github/redqx/attachment/svc-learn/2.seccomp_linux_amd64]
└─$ ./demo.elf
Usage:
        dup_file <input path> <output_path>

┌──(kali㉿G16-7620)-[~/github/redqx/attachment/svc-learn/2.seccomp_linux_amd64]
└─$ ./demo.elf flag.txt hacker.txt
[*] cp 'flag.txt' to 'hacker.txt'
Configuring seccomp
[*] open(argv[1], O_RDONLY)=3
Bad system call
```



sock_filter 规则的返回值如下,后面会用到的

```
SECCOMP_RET_ALLOW：允许系统调用通过。
SECCOMP_RET_KILL_PROCESS：杀死整个进程，即结束进程。
SECCOMP_RET_TRAP：禁止并强制引发 SIGSYS 信号（与 SIGILL、SIGABRT 类似）。
SECCOMP_RET_TRACE：允许并将事件传递给跟踪器（tracee）。
SECCOMP_RET_KILL_THREAD：杀死线程，即终止当前线程。
SECCOMP_RET_KILL：与 SECCOMP_RET_KILL_THREAD 含义相同，只是别名。
SECCOMP_RET_ERRNO：返回一个 errno 错误码。
SECCOMP_RET_USER_NOTIF：通知用户空间的监听程序，即向用户态传递信息。
SECCOMP_RET_LOG：记录事件到内核日志中。
```







# (三), ptrace + Seccomp

原理同`(一), ptrace监控系统调用`

我们配置`Seccomp`规则, 当遇到目标系统调用时,把异常抛给ptrace父进程



```c
// === 配置SECCOMP规则
struct sock_filter filter[] = 
{
    // 监控__NR_openat
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_openat, 0, 1),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_TRACE),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
    //SECCOMP_RET_TRACE：允许并将事件传递给跟踪器（tracee）。
};
```

遇到目标系统调用,执行 `BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_TRACE),`

然后tracer去处理相关逻辑, 比如修改寄存器等等

见代码==>[3.ptrace-seccomp-linux_amd64](https://github.com/redqx/attachment/tree/master/svc-learn/3.ptrace-seccomp-linux_amd64)  建议看代码

代码的逻辑:

子进程: 

- 配置Seccomp规则
- 用`syscall(__NR_openat...`打开文件`/home/kali/tmp/flag.txt`,然后输出到STD_OUT

父进程:

- 配置ptrace模式,才可以接收SECCOMP_RET_TRACE传递过来的信号
  -  `ptrace(PTRACE_SETOPTIONS, pid, 0, PTRACE_O_TRACESECCOMP);//设置 ptrace模式`

- 父进程进入消息循环,当接受到SECCOMP_RET_TRACE的信号时,如果是目标系统调用,修改相关寄存器,重定向到其它文件,于是子进程输出的内容就不再是原始的内容了

执行:

```
┌──(kali㉿G16-7620)-[~/github/redqx/attachment/svc-learn/3.ptrace-seccomp-linux_amd64]
└─$ gcc demo.c -o demo.elf

┌──(kali㉿G16-7620)-[~/github/redqx/attachment/svc-learn/3.ptrace-seccomp-linux_amd64]
└─$ ./demo.elf
[Openat /home/kali/tmp/flag.txt]
hacker{you was hacked!!!}

┌──(kali㉿G16-7620)-[~/github/redqx/attachment/svc-learn/3.ptrace-seccomp-linux_amd64]
└─$

```

正常应该输出`D0g3{Welcome To CTF}`



arrch64版本 见代码==> [4.ptrace-seccomp-arrch64_android](https://github.com/redqx/attachment/tree/master/svc-learn/4.ptrace-seccomp-arrch64_android), 原始项目: https://github.com/xiaotujinbnb/ptrace-seccomp-demo

```
// 用的Android\Sdk\ndk\26.1.10909125\toolchains\llvm\prebuilt\windows-x86_64\bin\clang++.exe
λ clang++ -target aarch64-linux-android29 arm_seccomp_ptrace.cpp -o tuziseccomp -static-libstdc++
λ adb push .\tuziseccomp /data/local/tmp
```

Android shell

```
PBCM10:/data/local/tmp $ chmod a+x tuziseccomp
PBCM10:/data/local/tmp $ ./tuziseccomp
syscall num : 56
[Openiat /data/local/tmp/flag.txt]
pid : 20572  addr : 5559d50940 str : /data/local/tmp/hacker.txt sz : 27
hacker{you was hacked!!!}
syscall num : 56
```



# (四), Frida-Seccomp

原项目: https://github.com/Abbbbbi/Frida-Seccomp

原作者对该项目的分析介绍: [分享一个Android通用svc跟踪以及hook方案——Frida-Seccomp](https://bbs.kanxue.com/thread-271815.htm) 建议看代码



在**《(一), ptrace监控系统调用》** 中,我们用ptrace捕捉了syscall的调用

在**《(二), 什么是Seccomp》**中,我们用系统自带的seccomp过滤规则来过滤系统调用,但并没有做自定义的修改处理

在**《(三), ptrace + Seccomp》** 中,我们用ptrace + Seccomp, 把Seccomp捕捉到的异常交给ptrace来处理

在**(四), Frida-Seccomp**中

原作者 seccomp 配置的规则如下

```c
    struct sock_filter filter[] = {
            BPF_STMT(BPF_LD + BPF_W + BPF_ABS, 0),
            BPF_JUMP(BPF_JMP + BPF_JEQ + BPF_K, nr, 0, 1),
            BPF_STMT(BPF_RET + BPF_K, SECCOMP_RET_TRAP),
            BPF_STMT(BPF_RET + BPF_K, SECCOMP_RET_ALLOW),
    };
```

如果是目标调用, 那么返回 `SECCOMP_RET_TRAP`, 其它调用允许执行.

` SECCOMP_RET_TRAP`会触发一个  SIGSYS 信号（与 SIGILL、SIGABRT 类似）。**同时拒绝系统调用.**

原作者使用frida自带的**Process.setExceptionHandler**函数, 即可捕获异常`SIGSYS`, 并在自己写的回调中进行数据处理.



说一下该项目的编写逻辑之类的

本来是使用frida进行一个so注入来实现相应的功能

```js
// frida inject so
function hook_dlopen()
{
    const android_dlopen_ext = Module.findExportByName(null, "android_dlopen_ext");
    Interceptor.attach(android_dlopen_ext, 
    {
        onEnter: function(args) {
            this.path = args[0].readCString();
            console.log(this.path)
        },onLeave(ret){
            if (this.path && (this.path).indexOf("libsvctest2.so") >= 0) {
                inject();
            }
        }
    });
}

function inject(){
    const dlopen = new NativeFunction(Module.findExportByName(null, 'dlopen'), 'pointer', ['pointer', 'int']);
    const soPath = Memory.allocUtf8String("/data/local/tmp/libtracer.so");
    var ret = dlopen(soPath, 2);
    console.log("dlopen ret: ", ret);
    const start_trace = new NativeFunction(Module.findExportByName("libtracer.so", "_Z11start_tracev"), 'void', []);
    start_trace();

}

setImmediate(hook_dlopen)
```

但是frida提供了强大的`CModule`模块,可以动态的编译我们的C代码, 于是我们可以获取动态编译的C代码,然后用于注入



执行逻辑:

以spawn模式启动

1), 在so加载时,做hook的初始化

```js
Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"), 
{
    onEnter(args) 
    {
        if (g_lpf_cm_install_seccomp_filter == null) 
        {
            hook_init();//第一次加载so时,就初始化init()
        }
    }
})
```

2), 

进入 hook_init()函数

```js
//CModule已经初始化好了
function hook_init() 
{
    //初始化，需要在主线程初始化且需要一个比较早的时机，frida脚本自己创建的一个C线程(没被安装seccomp规则)

    //CModule层,函数获取
    g_lpf_cm_thread_syscall_tvar = new NativeFunction(cm.pthread_syscall_create, "pointer", [])()  //创建一个没有被seccomp过滤的线程
    //woc,这里不仅仅获取了thread_syscall_t,而且还调用了pthread_syscall_create.此刻已有线程被创建
    
    g_lpf_cm_findSoinfoByAddr = new NativeFunction(cm.findSoinfoByAddr, "pointer", ["pointer"])
    g_lpg_cm_get_base = new NativeFunction(cm.get_base, "uint64", ["pointer"])
    g_lpf_cm_get_size = new NativeFunction(cm.get_size, "size_t", ["pointer"])
    g_lpf_cm_call_task = new NativeFunction(cm.call_task, "pointer", ["pointer", "pointer", "int"])
    g_lpf_cm_install_seccomp_filter = new NativeFunction(cm.install_seccomp_filter, "int", ['uint32'])
    g_lpf_cm_lock = new NativeFunction(cm.lock, "int", ["pointer"])
    g_lpf_cm_unlock = new NativeFunction(cm.unlock, "int", ["pointer"])
    
    // 异常处理 捕获seccomp异常 <-- SECCOMP_RET_TRAP
    Process.setExceptionHandler(function (details) 
    {
        const current_off = details.context.pc - 4; //指向当前异常发生的pc, 本来pc是指向异常的下一个位置
        // 010000d4 是4字节
        
        // 判断是否是seccomp导致的异常 读取opcode 010000d4 == svc 0
        if (details.message == "system error" 
            && details.type == "system"
            && utils_hex(ptr(current_off).readByteArray(4)) == "010000d4") //机器码 D4000001 `svc     #0x0`
        {
            //进入SVC异常处理

            // 上锁避免多线程问题
            // g_lpf_cm_lock(g_lpf_cm_thread_syscall_tvar); //源代码感觉写得有问题
            // 获取x8寄存器中的调用号
            const nr_syscall_id = details.context.x8.toString(10);
            let loginfo = "\n=================="
            loginfo += `\nSVC[${syscall_enum_infos[nr_syscall_id][1]}|${nr_syscall_id}] ==> PC:${utils_addrToString(current_off)} Pid:${Process.id} Tid:${Process.getCurrentThreadId()}`
            // 构造线程syscall调用参数
            const args = Memory.alloc(7 * 8)
            args.writePointer(details.context.x8)
            let args_reg_arr = {}
            for (let index = 0; index < 6; index++) 
            {
                //eval 动态执行js代码
                eval(`args.add(8 * (index + 1)).writePointer(details.context.x${index})`)//分别获取当前寄存器参数 x0,x1,x2,x3,x4,x5,x6,写入开辟的c内存中
                eval(`args_reg_arr["arg${index}"] = details.context.x${index}`) //同时写入js的变量中
            }
            // 获取手动堆栈信息
            loginfo += "\n" + utils_stacktrace(ptr(current_off), details.context.fp, details.context.sp).map(utils_addrToString).join('\n')
            // 打印传参
            loginfo += "\nargs = " + JSON.stringify(args_reg_arr)
            // 调用线程syscall 赋值x0寄存器
            details.context.x0 = g_lpf_cm_call_task(g_lpf_cm_thread_syscall_tvar, args, 0);//传递线程函数? 寄存器参数, 
            loginfo += "\nret = " + details.context.x0.toString()
            // 打印信息
            utils_call_thread_log(loginfo)
            // 解锁
            // g_lpf_cm_unlock(g_lpf_cm_thread_syscall_tvar)
            return true;
        }
        return false;
    })
    // openat的调用号
    g_lpf_cm_install_seccomp_filter(Target_NR); //开启线程过滤
}
```



3), 首先是获取CModule的函数pthread_syscall_create, 然后调用它, 并返回一个`thread_syscall_t`类型的变量

```c
typedef struct {
    int type;
    int isTask;
    void *args;
    int isReturn;
    void *ret;
    pthread_t thread;
    pthread_mutex_t mutex;
} thread_syscall_t;
```

pthread_syscall_create,会创建一个空的C线程(未被安装secomp规则), 该线程会根据frida给出的指示去执行一些相应的操作

该线程内容如下

```c
void *pthread_syscall(void *args)
{
    thread_syscall_t *syscall_thread = (thread_syscall_t *)args;
    while(1)
    {
        //syscall_threa会被frida所在线程修改,于是下面的执行逻辑就会发生改变
        lock(syscall_thread);
        if(syscall_thread->isTask)//一开始isTask为0, 线程内部死循环,无工作内容,处于未激活状态
        {
            if(syscall_thread->type == 0)
            {
                syscall_thread->ret = call_syscall(syscall_thread->args);
            }
            else if(syscall_thread->type == 1)
            {
                syscall_thread->ret = call_log(syscall_thread->args);
            }
            else if(syscall_thread->type == 2)
            {
                syscall_thread->ret = call_read_maps(syscall_thread->args);
            }
            syscall_thread->args = NULL;
            syscall_thread->isReturn = 1;
            syscall_thread->isTask = 0;
        }
        unlock(syscall_thread);
    }
    return NULL;
}
```



进入异常设置过程 ` Process.setExceptionHandler(function (details) `

```js
// 异常处理 捕获seccomp异常 <-- SECCOMP_RET_TRAP
Process.setExceptionHandler(function (details) 
{
	
}
```

首先是获取异常类型,异常发生的代码位置,以及匹配相关的机器码

```js
const current_off = details.context.pc - 4; //指向当前异常发生的pc, 本来pc是指向异常的下一个位置
// 判断是否是seccomp导致的异常 读取opcode 010000d4 == svc 0
if (details.message == "system error" 
    && details.type == "system"
    && utils_hex(ptr(current_off).readByteArray(4)) == "010000d4") //机器码 D4000001 `svc     #0x0`
{


}
```

`D4000001 `机器码对应的汇编就是`svc     #0x0`

当匹配后,就进入处理流程

首先获取调用号,进程id,线程id

```js
const nr_syscall_id = details.context.x8.toString(10);
let loginfo = "\n=================="
loginfo += `\nSVC[${syscall_enum_infos[nr_syscall_id][1]}|${nr_syscall_id}] ==> PC:${utils_addrToString(current_off)} Pid:${Process.id} Tid:${Process.getCurrentThreadId()}`

//生成内容如下
//SVC[openat|56] ==> PC:0x7d111c7884[linker64:0xfd884] Pid:12237 Tid:12237
```



然后读取寄存器,并把寄存器写入c内存以及变量中

```js
// 构造线程syscall调用参数
const args = Memory.alloc(7 * 8); //分配一块c内存
args.writePointer(details.context.x8); //先写入调用号
let args_reg_arr = {}
for (let index = 0; index < 6; index++) //然后写入后面的机器
{
	//eval 动态执行js代码
	eval(`args.add(8 * (index + 1)).writePointer(details.context.x${index})`)//分别获取当前寄存器参数 x0,x1,x2,x3,x4,x5,x6,写入开辟的c内存中
	eval(`args_reg_arr["arg${index}"] = details.context.x${index}`) //同时写入js的变量中
}
```

然后手动获取堆栈信息,打印寄存器参数

```js
// 获取手动堆栈信息
loginfo += "\n" + utils_stacktrace(ptr(current_off), details.context.fp, details.context.sp).map(utils_addrToString).join('\n')
// 打印寄存器参数
loginfo += "\nargs = " + JSON.stringify(args_reg_arr)
```

效果是

```
09-10 17:13:42.880 12237 12298 D seccomp : 0x7d111c7884[linker64:0xfd884]
09-10 17:13:42.880 12237 12298 D seccomp : 0x7d1110bd4c[linker64:0x41d4c]
09-10 17:13:42.880 12237 12298 D seccomp : 0x7d1110c004[linker64:0x42004]
09-10 17:13:42.880 12237 12298 D seccomp : 0x7d11103664[linker64:0x39664]
09-10 17:13:42.880 12237 12298 D seccomp : 0x7d11106ba4[linker64:0x3cba4]
09-10 17:13:42.880 12237 12298 D seccomp : 0x7d111020e0[linker64:0x380e0]
09-10 17:13:42.880 12237 12298 D seccomp : 0x7d0b5f9dd8[unkownmem:]
09-10 17:13:42.880 12237 12298 D seccomp : 0x7d0b5f9d0c[unkownmem:]
09-10 17:13:42.880 12237 12298 D seccomp : 0x7d0d32dc60[libnativeloader.so:0x7c60]
09-10 17:13:42.880 12237 12298 D seccomp : 0x7c8aba0eb8[libart.so:0x37beb8]
09-10 17:13:42.880 12237 12298 D seccomp : args = {"arg0":"0xffffff9c","arg1":"0x7ff786c238","arg2":"0x80000","arg3":"0x0","arg4":"0x7ff786c278","arg5":"0x7d0ff65740"}
```



然后就是frida给线程传参,调用syscall

ps: frida Process.setExceptionHandler后, 如果继续执行后, svc调用不会得到执行,需要我们手动去调用执行,  

因为 `SECCOMP_RET_TRAP`触发一个  SIGSYS 信号 ,**同时拒绝系统调用.**

```js
// 调用线程syscall 赋值x0寄存器
details.context.x0 = g_lpf_cm_call_task(g_lpf_cm_thread_syscall_tvar, args, 0);//传递线程函数? 寄存器参数, 
loginfo += "\nret = " + details.context.x0.toString()
```



call_task比较有意思 (有意思的是互斥体的运用)

```c
void *call_task(thread_syscall_t *syscall_thread,void *args,int type)
{
    if(syscall_thread->isTask == 0)//如果线程处于未激活状态
    {
        //激活线程
        lock(syscall_thread);
        syscall_thread->args = args; //配置线程内部参数
        syscall_thread->type = type;//设置类型
        syscall_thread->isTask = 1;//开启线程
        unlock(syscall_thread);
    }
    do
    {
        if(syscall_thread->isReturn)//一开始为0
        {
            lock(syscall_thread);
            syscall_thread->isReturn = 0;
            unlock(syscall_thread);
            return syscall_thread->ret;
            
        }
    }while(1);//死循环,等待线程return
}

void *pthread_syscall(void *args)
{
    thread_syscall_t *syscall_thread = (thread_syscall_t *)args;
    while(1)
    {
        lock(syscall_thread);
        if(syscall_thread->isTask)//一开始isTask为0, 线程内部死循环,无工作内容,处于未激活状态
        {
            if(syscall_thread->type == 0)
            {
                syscall_thread->ret = call_syscall(syscall_thread->args);
            }
            else if(syscall_thread->type == 1)
            {
                syscall_thread->ret = call_log(syscall_thread->args);
            }
            else if(syscall_thread->type == 2)
            {
                syscall_thread->ret = call_read_maps(syscall_thread->args);
            }
            syscall_thread->args = NULL;
            syscall_thread->isReturn = 1;
            syscall_thread->isTask = 0;
        }
        unlock(syscall_thread);
    }
    return NULL;
}
//syscall线程创建

thread_syscall_t *pthread_syscall_create()
{
    thread_syscall_t *syscall_thread = (thread_syscall_t *)malloc(sizeof(thread_syscall_t));
    syscall_thread->type = 0;
    syscall_thread->isTask = 0;
    syscall_thread->args = NULL;
    syscall_thread->ret = NULL;
    syscall_thread->isReturn = 0;
    pthread_mutex_init(&syscall_thread->mutex, NULL);
    pthread_t threadId;
    pthread_create(&threadId, NULL, &pthread_syscall, (void *)syscall_thread);
    syscall_thread->thread = threadId;
    return syscall_thread;
}
```



其实关于栈是如何回溯,以及参数如何打印的,,,,感觉不是很在意

其中必要重要的就是我们需要 先开一个线程(未被seccomp过了的),,,然后在这个线程中去执行一些系统调用







执行

```
λ python multi_frida_seccomp.py com.androidpacker.n2
Device(id="1d518c72", name="PBCM10", type='usb')
[*] Enabled spawn gating
[*] Attach Application com.androidpacker.n2 pid: 25845
[*] Application onResume
[*] Running Frida-Seccomp
[*] install_seccomp_filter(56)
```

日志输出文件

```
09-11 15:08:10.683 26019 26059 D seccomp : 
09-11 15:08:10.683 26019 26059 D seccomp : ==================
09-11 15:08:10.683 26019 26059 D seccomp : SVC[openat|56] ==> PC:0x7a5aa63884[linker64:0xfd884] Pid:26019 Tid:26019
09-11 15:08:10.683 26019 26059 D seccomp : 0x7a5aa63884[linker64:0xfd884]
09-11 15:08:10.683 26019 26059 D seccomp : 0x7a5a9a8004[linker64:0x42004]
09-11 15:08:10.683 26019 26059 D seccomp : 0x7a5a99f664[linker64:0x39664]
09-11 15:08:10.683 26019 26059 D seccomp : 0x7a5a9a2ba4[linker64:0x3cba4]
09-11 15:08:10.683 26019 26059 D seccomp : 0x7a5a99e0e0[linker64:0x380e0]
09-11 15:08:10.683 26019 26059 D seccomp : 0x79d425cdd8[unkownmem:]
09-11 15:08:10.683 26019 26059 D seccomp : 0x79d425cd0c[unkownmem:]
09-11 15:08:10.683 26019 26059 D seccomp : 0x7a5628ec60[libnativeloader.so:0x7c60]
09-11 15:08:10.683 26019 26059 D seccomp : 0x79d319deb8[libart.so:0x37beb8]
09-11 15:08:10.683 26019 26059 D seccomp : 0x79c94650e4[libopenjdkjvm.so:0x50e4]
09-11 15:08:10.683 26019 26059 D seccomp : args = {"arg0":"0xffffff9c","arg1":"0x7fcef0aef8","arg2":"0x80000","arg3":"0x0","arg4":"0x0","arg5":"0xffffffffffff0000"}
09-11 15:08:10.683 26019 26059 D seccomp : ret = 0x3e
...
```

ps: 有时会抽风,日志文件为空





# (五), Sigaction-seccomp

作者A提出的方案以及分析: [基于seccomp+sigaction的Android通用svc hook方案](https://bbs.kanxue.com/thread-277544.htm)

作者B根据作者A的方案, 完整的落地项目: [Frida-Sigaction-Seccomp](https://github.com/LLeavesG/Frida-Sigaction-Seccomp) 建议看代码



和 **《(四), Frida-Seccomp》**类似

**Sigaction-seccomp**配置的规则也是 ` SECCOMP_RET_TRAP`, 如果是目标调用, 就触发 SIGSYS 信号（与 SIGILL、SIGABRT 类似）。**同时拒绝系统调用.**

**Frida-Seccomp**使用的frida自带的**Process.setExceptionHandler**来捕获异常

而**Sigaction-seccomp**使用的是 `sigaction(SIGSYS, &sa, NULL)`注册具体异常信号的处理函数handler

在handler中,我们可以去主动执行原始的系统调用, 然后修改上下文,再返回过去,从而达到hook的小效果

示例代码如下 , 调用 `void mm_install_signalhandle()`

```c
int mm_install_filter() 
{
    struct sock_filter filter[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, target_nr, 0, 2),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[SECMAGIC_POS])),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SECMAGIC, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_TRAP)
    };
    struct sock_fprog prog = {
            .len = (unsigned short) (sizeof(filter) / sizeof(filter[0])),
            .filter = filter,
    };
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) {
        on_message("prctl(NO_NEW_PRIVS)");
        return 1;
    }
    if (prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog)) {
        on_message("prctl(PR_SET_SECCOMP)");
        return 1;
    }
    return 0;
}
void mm_sig_handler(int signo, siginfo_t *info, void *data) 
{
    int my_signo = info->si_signo;
    // log("my_signo: %d", my_signo);
    // 读取参数
    unsigned long sysno = ((ucontext_t *) data)->uc_mcontext.regs[8];
    unsigned long arg0 = ((ucontext_t *) data)->uc_mcontext.regs[0];
    unsigned long arg1 = ((ucontext_t *) data)->uc_mcontext.regs[1];
    unsigned long arg2 = ((ucontext_t *) data)->uc_mcontext.regs[2];

    int fd, mincore_ret;

    switch (sysno) 
    {
        log("sysno: %d", sysno);
        case __NR_openat:
            // syscall with args[3] SEC_MAGIC avoid infinite loop
            fd = syscall(__NR_openat, arg0, arg1, arg2, SECMAGIC);//多传递一个参数过去SECMAGIC,表示已经被hook了
            log("[Openat 56] filename: %s", (char *) arg1);//读取arg1
            ((ucontext_t *) data)->uc_mcontext.regs[0] = fd;//把返回值给x0
            log("[Openat 56] ret fd: %d", fd);//输出返回值
            break;
        default:
            break;
    }
}

void mm_install_signalhandle()
{
    struct sigaction sa;
    sigset_t sigset;

    sigfillset(&sigset);

    sa.sa_sigaction = mm_sig_handler;//绑定消息处理函数
    sa.sa_mask = sigset;
    sa.sa_flags = SA_SIGINFO;
    mm_install_filter();//配送seccomp规则
    
    if (sigaction(SIGSYS, &sa, NULL) == -1) //注册SIGSYS的sa(含消息处理函数)
    {
        log("sigaction init failed.\n");
        return ;
    }

    log("sigaction init success.\n");
}

```



SECCOMP_RET_TRAP 会引发程序阻塞机制，此时系统会产生一个`SIGSYS`信号,并使原程序处于临时阻塞状态。

我们hook的后,为了避免死循环(目标调用不断的被我们hook),  hook后的svc调用时, 需要多传递一个参数`SECMAGIC`,

主要是用于区别该svc调用是否已经被hook了.

ps: 如果目标调用本身已经使用了参数arg2,我们就不能把SECMAGIC传递给args[2],此刻是不是就有问题了



在**《(四), Frida-Seccomp》**中, 它为什么没有进入死循环的hook?

因为 **Frida-Seccomp** 一开始就创建了一个没有安装seccomp过滤规则的线程(暂且称之为线程X)

在**SECCOMP_RET_TRAP**后, frida会让**线程X**去执行被拒绝的系统调用, 线程X执行的系统调用并不会被seccomp过滤

在**《(五), Sigaction-seccomp》**中, 为了避免死循环, 他会在seccomp识别的过程中,主动的去判断目标调用是否已经被hook过了

如果已经被hook过了,就不需要再触发**SECCOMP_RET_TRAP**,允许放行



执行

```
λ frida -U -f com.androidpacker.n2 -l .\demo2.js
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
Spawned `com.androidpacker.n2`. Resuming main thread!
[PBCM10::com.androidpacker.n2 ]->
```



日志

```
λ adb logcat | find "ECHO"
09-11 15:13:22.243 26441 26441 D ECHO    : sigaction init success.
09-11 15:13:22.244 26441 26441 D ECHO    : [Openat 56] filename: /data/app/com.androidpacker.n2-ANq9Ffz6AVeCnK6zo0YXNA==/base.apk
09-11 15:13:22.244 26441 26441 D ECHO    : [Openat 56] ret fd: 62
09-11 15:13:22.244 26441 26441 D ECHO    : [Openat 56] filename: /data/app/com.androidpacker.n2-ANq9Ffz6AVeCnK6zo0YXNA==/base.apk
09-11 15:13:22.244 26441 26441 D ECHO    : [Openat 56] ret fd: 63
09-11 15:13:22.304 26441 26441 D ECHO    : [Openat 56] filename: /dev/__properties__/u:object_r:use_memfd_prop:s0
09-11 15:13:22.304 26441 26441 D ECHO    : [Openat 56] ret fd: 63
09-11 15:13:22.504 26441 26441 D ECHO    : [Openat 56] filename: /data/local/tmp/flag.txt
09-11 15:13:22.504 26441 26441 D ECHO    : [Openat 56] ret fd: 63
09-11 15:13:22.504 26441 26441 D ECHO    : D0g3
09-11 15:13:22.504 26441 26441 D ECHO    : [Openat 56] filename: /data/local/tmp/flag.txt
09-11 15:13:22.504 26441 26441 D ECHO    : [Openat 56] ret fd: 63
09-11 15:13:22.505 26441 26441 D ECHO    : D0g3{welcome to CTF!}
09-11 15:13:22.505 26441 26441 D ECHO    : [Openat 56] filename: /data/local/tmp/flag.txt
09-11 15:13:22.505 26441 26441 D ECHO    : [Openat 56] ret fd: 63
09-11 15:13:22.505 26441 26441 D ECHO    : D0g3{welcome to CTF!}
```

