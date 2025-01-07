---
layout: post
title:  "如何用IDA调试fork后的子进程"
categories: [debug-way] 
---



**本文的一些图片引用可能有一些问题, 比如数据不对劲,但无伤大雅**

环境:

wsl-kali-2024

ida-7.7  插件: Lazy_ida, 还有一个什么插件不知道什么名字, 可以把汇编转字节码

测试文件: elf_amd64

```
    Arch:     amd64-64-little
    RELRO:    Partial RELRO
    Stack:    No canary found
    NX:       NX enabled
    PIE:      PIE enabled
```



# 发现



**目标** 首先我想要干嘛?

我想达到这么一个效果, fork()函数执行之后,子进程不立刻执行原有的流程,

而是等待我另外一个IDA附加之后,让IDA决定是否立马执行



示例代码

```c
#include <stdio.h>
#include <unistd.h>

void demo_func(int x,int y,int z)
{
    if(fork())
    {
        //父亲
        while(1)
        {
            
            printf("[F]=>%d\n",x);
            x++;
            if(x==100){
                break;
            }
            sleep(1);
        }
    }else{
        //儿子
        while(1)
        {
            
            printf("[S]=>%d\n",y);
            y++;
            if(y==50){
                break;
            }
            sleep(1);
        }
    }
}

int main()
{
    demo_func(1,2,3);
    return 0;
}
```



首先我们得明白fork()干了什么?

其实我也不太知道它干了什么, 但有一点我们是都知道的: **fork()把父进程的内存拷贝进了子进程**

知道这一点就可以实现我的思路一了, 首先我们得对这句话多加理解和思考.

我其实思考得并不多,只是碰巧想到了一些点子. (想了很久,QAQ....)



**1), 发现一:**

我发现子进程和父进程的加载的基地址是一样的,这点让我有点惊讶

同时也作证了  fork后的子进程拷贝了父进程的内存,这可能是我们的突破点

**2), 发现二**

我在fork()函数之前或者之后下的断点,也出现在了子进程

这就导致子进程运行的时候,会碰到int3异常,然后异常抛给了父进程, 这里可能是我们的突破点

![image-20240724235546295](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240724235546295.png)

**3), 发现三**

执行完fork后,可以看到一些寄存器发生了变化

rax是fork的返回值,当然发生变化

然后是rcx,rdx,rdi,rsi都变为了0

r10和r11也发生了变化

然后当前函数栈并没有发生变化



![image-20240724232432414](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240724232432414.png)



# (思路一): jmp self

写一个死循环, 让子进程无法执行后续的逻辑



![image-20240725000553220](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725000553220.png)



在执行fork之前,我们就在父进程 `0x000055619C6C01A2`处写入死循环

比如 效果是`jmp 0x000055619C6C01A2`

在写入之前,我们得对以前的字节码备份,因为后面需要还原的

这句汇编代码的字节码只需要2字节: `EB FE`

修改`8B 45` => `EB FE`

![image-20240725000949398](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725000949398.png)

然后我们就直接在父进程F8

![image-20240725001040591](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725001040591.png)

然后启动另外一个IDA附加我们的子进程

此刻的子进程还是死循环中

开启另外一个IDA

```
┌──(kali㉿G16-7620)-[~/code/file/dbg/ida/7.7]
└─$ ./linux_server64 -p 6789
IDA Linux 64-bit remote debug server(ST) v7.7.27. Hex-Rays (c) 2004-2022
```

然后IDA附加子进程

![image-20240725001202548](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725001202548.png)

注意端口

![image-20240725001221351](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725001221351.png)

父进程的PID是11127,

![image-20240725001251217](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725001251217.png)

选择子进程,

![image-20240725001409889](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725001409889.png)

进入子进程后,直接F9

![image-20240725001443654](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725001443654.png)

在父进程中,死循环位于0x000055619C6C01A2

![image-20240725001513781](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725001513781.png)

在子进程中,相同的位置,我们去往,并下一个断点

ps: 子进程和父进程的内存分布是一样的

![image-20240725001607641](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725001607641.png)

下了断点后,死循环就立刻停下来了

此刻我们还原以前的字节码,重新设置rip, 就可以正常调试子进程了   `EB FE ` => `8B 45` 



# (思路二): sleep(60)



思路一有个缺点: 子进程进入死循环, 我的电脑的风扇就开始转了,貌似死循环很吃内存

同时思路一有个优点: 那就是我们可以慢慢的操作,直到成功附加子进程

思路一的优点是相对思路二的



针对思路一,死循环吃CPU, 那就调用sleep, 睡60秒

为什么睡60s, 经过测试总结的, 读者可自行调节

sleep函数在libc.so中本来就存在, 所以我们可以直接去调用.

而不是因为本代码本来就有sleep函数的导入





![image-20240724224042289](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240724224042289.png)

在libc.so中找到sleep

![image-20240724212132882](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240724212011422.png)

找到位置是 0x7F2EC86B7050

![image-20240724224058363](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240724224058363.png)

这一次我们写入的6个字节码,同时还需要修改一下栈[rsp]的数据, 

同样我们要记录备份一下字节码, 同时还有[rsp]的值

```
写入 8B 45 F8 89 C6 48 => 6A 3C 5F FF 14 24
```

效果是

```assembly
push    60
pop     rdi
call    qword ptr [rsp]
```

同时把[rsp]的值修改为sleep函数的地址

`0x0000003000000000 `=> sleep函数地址

栈视图

![image-20240725003227657](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725003227657.png)

汇编视图

![image-20240725003518796](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725003518796.png)



然后, 我们在父进程F8执行了fork()

然后就是和思路一操作一样了

注意是 `call    qword ptr [rsp]`后一句下断点

之后是完全可以成功断点来的, 得在子进程运行60s之后

所以我们的操作得在60s之内完成,我测试了一下自己差不多可以在40秒完成

![image-20240724235259801](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240724235259801.png)

# (思路三): int3异常



既然会出现内存拷贝

那么我在子进程第一句代码处下一个断点

![image-20240725004938138](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725004938138.png)

在父进程运行了F8了fork()之后

父进程继续F8

子进程抛来一个异常(因为子进程遇到了int3异常)

子进程遇到异常,抛给了父进程



![image-20240725004956865](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725004956865.png)

此刻子进程处于暂停状态

但是我现在还无法做到让IDA附加子进程, 会提示报错,不让附加

![image-20240725005849936](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725005849936.png)

父进程后续运行会, IDA一直会提醒父进程处理异常

![image-20240725005948798](https://raw.githubusercontent.com/redqx/redqx.github.io/master/_posts/img/image-20240725005948798.png)

子进程无法处理int3异常,没有异常处理函数

父进程又不能直接忽略异常, 因为跳过int3, 子进程后续执行会出现问题