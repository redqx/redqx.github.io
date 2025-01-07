---
layout: post
title:  "(gaffe23/linux-inject)项目分析-linux之SO注入"
categories: [github-project]
---



# 序言

原始项目: [https://github.com/gaffe23/linux-inject ](https://github.com/gaffe23/linux-inject )

自己修改过的项目: [https://github.com/redqx/linux-inject2](https://github.com/redqx/linux-inject2)

一个9年前(base 2024)的项目, 没怎么更新过,但项目在9年前来说也是写得非常棒的一个项目,

放到现在有些代码已经过时了,导致无法运行成功

```
fork: 224
start: 1.1k
time: 2024/8/31
```



# x86_64 分析



## 项目原理

- injector使用 ptrace attach 目标进程(target), 然后target停下来
- injector寻找一块可执行rwx的空间`(/proc/{pid}/maps)`, 写入shellcode, 同时备份写入的空间为backup
- injector获取target的寄存器环境,同时备份寄存器环境old_regs
- injector修改寄存器 rip指向shellcode,
- injector通过ptrace让程序跑起来, 先执行shellcode的malloc()函数,然后停下来
- injector获取寄存器环境, 通过rax获取malloc的返回值, rax = mem_buf_libpath, 
- injector通过ptrace往mem_buf_libpath写入so文件的路径
- injector继续让target执行,执行shellcode的dlopen,然后停下来
- injector获取寄存器环境, 通过rax获取dlopen的返回值, 非0则加载成功
- 此刻target已经加载了so
- injector让target继续执行shellcode的free(), 释放malloc()的mem_buf_libpath, 然后停下来
- injector 恢复old_regs, 恢复backup的指令, 然后通过detach继续让target跑起来



## 具体分析



injector传参方式有2种,,,

way1: 指定process_name, 通过process_name寻找目标进程的pid

way2: 直接传入pid



流程如下



injector获取so的绝对路径

```c
	char* libPath = realpath(libname, NULL); // 通过libcname获取libso的完整路径
```

injector获取process_pid

```c
	if(!strcmp(command, "-n")) // 通过进程名去获取进程的pid
	{
		processName = commandArg;
		target_pid = findProcessByName(processName);
		if(target_pid == -1)
		{
			fprintf(stderr, "doesn't look like a process named \"%s\" is running right now\n", processName);
			return 1;
		}

		printf("targeting process \"%s\" with pid %d\n", processName, target_pid);
	}
	else if(!strcmp(command, "-p"))//直接从参数获取pid
	{
		target_pid = atoi(commandArg);
		printf("targeting process with pid %d\n", target_pid);
	}
	else
	{
		usage(argv[0]);
		return 1;
	}
```



获取injector的libc.so.6的基地址

```c
long mylibcaddr = getlibcaddr(mypid); //
```

原理是通过/proc/{pid}/maps读取libc.so.6在内存中的布局

```
7f688cd83000-7f688cda9000 r--p 00000000 08:20 34128   /usr/lib/x86_64-linux-gnu/libc.so.6
7f688cda9000-7f688cf00000 r-xp 00026000 08:20 34128   /usr/lib/x86_64-linux-gnu/libc.so.6
7f688cf00000-7f688cf55000 r--p 0017d000 08:20 34128   /usr/lib/x86_64-linux-gnu/libc.so.6
7f688cf55000-7f688cf59000 r--p 001d1000 08:20 34128   /usr/lib/x86_64-linux-gnu/libc.so.6
7f688cf59000-7f688cf5b000 rw-p 001d5000 08:20 34128   /usr/lib/x86_64-linux-gnu/libc.so.6
```

可用读取到`7f688cd83000`就是libc.so.6在内存中的基地址

然后获取injector中, malloc, dlopen, free函数的偏移

```c
	int mypid = getpid();
	long mylibcaddr = getlibcaddr(mypid); //

	// find the addresses of the syscalls that we'd like to use inside the
	// target, as loaded inside THIS process (i.e. NOT the target process)
	long mallocAddr = getFunctionAddress("malloc");
	long freeAddr = getFunctionAddress("free");
	// long dlopenAddr = getFunctionAddress("__libc_dlopen_mode");//无法直接获取 __libc_dlopen_mode()
	long dlopenAddr = getFunctionAddress("dlopen");

	// use the base address of libc to calculate offsets for the syscalls
	// we want to use
	long libc_mallocOffset = mallocAddr - mylibcaddr;
	long libc_freeOffset = freeAddr - mylibcaddr;
	long libc_dlopenOffset = dlopenAddr - mylibcaddr;
```

然后获取target中, malloc, dlopen, free 函数的真实地址

```c
	long remote_LibcAddr = getlibcaddr(target_pid);
	long remote_MallocAddr = remote_LibcAddr + libc_mallocOffset;
	long remote_FreeAddr = remote_LibcAddr + libc_freeOffset;
	long remote_DlopenAddr = remote_LibcAddr + libc_dlopenOffset;
```

injector attach 目标进程, 

target在被attach后,会停下来, 发送一个signal消息给injector

injector等待这个消息,等待后, 获取此刻target寄存器环境, 备份为old_regs

```c
	ptrace_attach(target_pid); //附加调试目标进程,并等待子进程的停止, 目标进程收到被调试的信息后,会停下来
	ptrace_getregs(target_pid, &oldregs);//获取当前target寄存器信息
	memcpy(&regs, &oldregs, sizeof(struct user_regs_struct));
```

寻找一块可写入的rwx内存,,**待会**往里面写入shellcode

现在找到那块内存,,然后让regs.rip指向这块内存

同时给一些寄存器赋值 rdi,rsi,rdx,rcs...这些寄存器是给shellcode传参

```c
	// find a good address to copy code to
	// long addr = freespaceaddr(target) + sizeof(long); // 寻找第一块可写的内存,一般是代码段
	long remote_mem_rwx = freespaceaddr(target_pid) + 0xf00 ; //直接放远一点

	// now that we have an address to copy code to, set the target's rip to
	// it. we have to advance by 2 bytes here because rip gets incremented
	// by the size of the current instruction, and the instruction at the
	// start of the function to inject always happens to be 2 bytes long.
	regs.rip = remote_mem_rwx + 2; //实际执行的地方是 rip - 2, 所以我们指向的地方得是rip + 2
	// pass arguments to my function injectSharedLibrary() by loading them
	// into the right registers. note that this will definitely only work
	// on x64, because it relies on the x64 calling convention, in which
	// arguments are passed via registers rdi, rsi, rdx, rcx, r8, and r9.
	// see comments in injectSharedLibrary() for more details.
	regs.rdi = remote_MallocAddr;
	regs.rsi = remote_FreeAddr;
	regs.rdx = remote_DlopenAddr;
	regs.rcx = libPathLength;
	if(regs.rsp&0xf)
	{
		//高版本Linux中, 调用dlopen或者__libc_dlopen_mode前,保证rsp是16的倍数
		regs.rsp = regs.rsp - 8;
		//这个点卡了我2天,草!cao!
	}
	ptrace_setregs(target_pid, &regs);
	printf("[inject]: change target process status\n");
```



寻找内存的原理依然是读取 `/proc/{pid}/maps`

通常寻找的第一块rx内存是代码段,,,

```
55ca4511c000-55ca4514b000 r--p 00000000 08:20 16699                      /..
55ca4514b000-55ca4520f000 r-xp 0002f000 08:20 16699                      /..
55ca4520f000-55ca45248000 r--p 000f3000 08:20 16699                      /..
55ca45248000-55ca4524c000 r--p 0012b000 08:20 16699                      /..
55ca4524c000-55ca45255000 rw-p 0012f000 08:20 16699                      /..
```



**关于为什么`regs.rip = remote_mem_rwx + 2;`**

作者本来写的就是 `+2` 我不信邪,写`regs.rip = remote_mem_rwx;`

后来发现因为这个问题,引起了很大莫名其妙的问题....困扰很久...

后来通过调试,,,发现rip会指向addr -  2的地方执行,,尽管rip指向的是addr

所以我们要让rip指向我们要执行的地方,那么就让rip往后多指2字节

**关于为什么rsp - 8**

后来发现,,,调用dlopen或者`__libc_dlopen_mode`都需要让rsp是16的倍数

以前做pwn题,在调用system()前也要保证rsp是16的倍数



然后往找到的内存中写入shellcode, 并备份写入前已有的字节码

```c

	// figure out the size of injectSharedLibrary() so we know how big of a buffer to allocate. 
	size_t injectSharedLibrary_size = (intptr_t) injectSharedLibrary_end - (intptr_t)injectSharedLibrary; //按照我的修改方式,导致下面多复制了一些字节

	// also figure out where the RET instruction at the end of
	// injectSharedLibrary() lies so that we can overwrite it with an INT 3
	// in order to break back into the target process. note that on x64,
	// gcc and clang both force function addresses to be word-aligned,
	// which means that functions are padded with NOPs. as a result, even
	// though we've found the length of the function, it is very likely
	// padded with NOPs, so we need to actually search to find the RET.
	// intptr_t injectSharedLibrary_ret = (intptr_t)findRet(injectSharedLibrary_end) - (intptr_t)injectSharedLibrary;

	// back up whatever data used to be at the address we want to modify.
	char* backup = malloc(injectSharedLibrary_size * sizeof(char));
	ptrace_read(target_pid, remote_mem_rwx, backup, injectSharedLibrary_size);

	// set up a buffer to hold the code we're going to inject into the
	// target process.
	char* newcode = malloc(injectSharedLibrary_size * sizeof(char));
	memset(newcode, 0, injectSharedLibrary_size * sizeof(char));

	// copy the code of injectSharedLibrary() to a buffer.
	memcpy(newcode, (char*)injectSharedLibrary + 4, injectSharedLibrary_size);
	/*
.text:0000563A66E30F44 55                            push    rbp
.text:0000563A66E30F45 48 89 E5                      mov     rbp, rsp ; 跳过这几个字节
.text:0000563A66E30F48 56                            push    rsi
.text:0000563A66E30F49 52                            push    rdx
.text:0000563A66E30F4A 41 51                         push    r9
.text:0000563A66E30F4C 49 89 F9                      mov     r9, rdi
.text:0000563A66E30F4F 48 89 CF                      mov     rdi, rcx
.text:0000563A66E30F52 41 FF D1                      call    r9
	 */

	// overwrite the RET instruction with an INT 3.
	// newcode[injectSharedLibrary_ret] = INTEL_INT3_INSTRUCTION;

	// copy injectSharedLibrary()'s code to the target address inside the
	// target process' address space.
	ptrace_write(target_pid, remote_mem_rwx, newcode, injectSharedLibrary_size);//写入shellcode
```

shellcode内容如下

```c
// void injectSharedLibrary(long mallocaddr, long freeaddr, long dlopenaddr) // 这几个参数没用
void injectSharedLibrary()
{
	// here are the assumptions I'm making about what data will be located
	// where at the time the target executes this code:
	//
	//   rdi = address of malloc() in target process
	//   rsi = address of free() in target process
	//   rdx = address of __libc_dlopen_mode() in target process
	//   rcx = size of the path to the shared library we want to load

	// save addresses of free() and __libc_dlopen_mode() on the stack for later use
	asm(
		// rsi is going to contain the address of free(). it's going to get wiped
		// out by the call to malloc(), so save it on the stack for later
		"push %rsi \n"
		// same thing for rdx, which will contain the address of _dl_open()
		"push %rdx"
	);

	// char* lib_soname = malloc( xx_length )
	asm(
		
		"push %r9 \n" // save previous value of r9, because we're going to use it to call malloc()
		"mov %rdi,%r9 \n" // r9 = malloc()
		"mov %rcx,%rdi \n" // rdi = lenght(libso_name)
		"callq *%r9 \n" // call malloc()
		"pop %r9 \n" //pop the previous value of r9 off the stack
		"int $3" // 暂停一下,injector处理一下新开辟的内容rax, 往内存rax中写入libso_name
	);
	//继续运行 f9

	// call __libc_dlopen_mode() to load the shared library
	// __libc_dlopen_mode()无法直接通过dlsym()找到, 在静态的libc.so.6中也无法直接找到, __libc_dlopen_mode()好像是3个参数
	// 所以换位dlopen打开吧....
	asm(
		// get the address of __libc_dlopen_mode() off of the stack so we can call it
		"pop %rdx \n" // rdx = dlopen
		"push %r9 \n" // as before, save the previous value of r9 on the stack
		"mov %rdx,%r9 \n" //r9 = dlopen
		"mov %rax,%rdi \n" // rax = rdi = lib_soname
		"movabs $1,%rsi \n" // rsi = 1 = RTLD_LAZY
		"callq *%r9 \n" // call dlopen_mode
		"pop %r9 \n" // restore old r9 value
		"int $3" //暂停,让injector处理一下
	);

	// call free() to free the buffer we allocated earlier.
	//
	// Note: I found that if you put a nonzero value in r9, free() seems to
	// interpret that as an address to be freed, even though it's only
	// supposed to take one argument. As a result, I had to call it using a
	// register that's not used as part of the x64 calling convention. I
	// chose rbx.
	// 下面的free()函数感觉不一定要释放,^-^...
	asm(
		// at this point, rax should still contain our malloc()d buffer from earlier.
		// we're going to free it, so move rax into rdi to make it the first argument to free().
		//"mov %rax,%rdi \n" // rdi = rax = dlopen() ????
		"pop %rsi \n" // rsi = free()
		"push %rbx \n" // save previous rbx value
		"mov %rsi,%rbx \n" // rbx = rsi = free
		"xor %rsi,%rsi \n" // zero out rsi, because free() might think that it contains something that should be freed
		// break in so that we can check out the arguments right before making the call
		"int $3 \n" // 修改rdi为libso_path
		"callq *%rbx \n"// call free()
		"pop %rbx"// restore previous rbx value
	);

	//最后停止
	asm(
		"int $3 \n"
	);

	// we already overwrote the RET instruction at the end of this function
	// with an INT 3, so at this point the injector will regain control of
	// the target's execution.
}
```

大概功能就是

```
char* mem_libpath = malloc(xxx_len);//injector会往mem_libpath写入内容
void* handle = dlopen(mem_libpath,RTLD_LAZY)
free(mem_libpath)
```

我修改了`void injectSharedLibrary()`函数声明类型

原始的是`void injectSharedLibrary(long mallocaddr, long freeaddr, long dlopenaddr)`

原始的声明会让injectSharedLibrary多出一些字节码,反正我们也用不到那些参数

在shellcode写入后, 寄存器参数也准备好后

就让target跑起来

```c
ptrace_f9(target_pid,1); // 准备执行shellcode,参数已经放入寄存器中, 同时等待target的int中断
//ptrace(PTRACE_CONT,...
```

target**第一段**跑的shellcode代码如下

```c
	// here are the assumptions I'm making about what data will be located
	// where at the time the target executes this code:
	//
	//   rdi = address of malloc() in target process
	//   rsi = address of free() in target process
	//   rdx = address of __libc_dlopen_mode() in target process
	//   rcx = size of the path to the shared library we want to load

	// save addresses of free() and __libc_dlopen_mode() on the stack for later use
	asm(
		// rsi is going to contain the address of free(). it's going to get wiped
		// out by the call to malloc(), so save it on the stack for later
		"push %rsi \n"
		// same thing for rdx, which will contain the address of _dl_open()
		"push %rdx"
	);

	// char* lib_soname = malloc( xx_length )
	asm(
		
		"push %r9 \n" // save previous value of r9, because we're going to use it to call malloc()
		"mov %rdi,%r9 \n" // r9 = malloc()
		"mov %rcx,%rdi \n" // rdi = lenght(libso_name)
		"callq *%r9 \n" // call malloc()
		"pop %r9 \n" //pop the previous value of r9 off the stack
		"int $3" // 暂停一下,injector处理一下新开辟的内容rax, 往内存rax中写入libso_name
	);
```

可用看到最后有一个int3, 这个是为了停下来,让injector去处理

**第一段**shellcode执行的功能就是 `char* libso_path = malloc (xxx)`

在target执行了int3后,停下来,发消息给injector

injector处理如下,,

大概就是获取malloc的返回值rax,然后写入内容

```c
	// at this point, the target should have run malloc(). check its return
	// value to see if it succeeded, and bail out cleanly if it didn't.
	//struct user_regs_struct malloc_regs;
	memset(&regs, 0, sizeof(struct user_regs_struct));
	ptrace_getregs(target_pid, &regs);//
	unsigned long long remote_malloc_buf = regs.rax;//获取malloc函数返回地址, 虽然在x64下,long是8字节, 但regs.rax却是long long类型
	printf("[inject]: get remote addr for malloc() = %x\n",remote_malloc_buf);
	if(remote_malloc_buf == 0)
	{
		fprintf(stderr, "malloc() failed to allocate memory\n");
		restoreStateAndDetach(target_pid, remote_mem_rwx, backup, injectSharedLibrary_size, oldregs);
		free(backup);
		free(newcode);
		return 1;
	}

	// if we get here, then malloc likely succeeded, so now we need to copy
	// the path to the shared library we want to inject into the buffer
	// that the target process just malloc'd. this is needed so that it can
	// be passed as an argument to __libc_dlopen_mode later on.

	// read the current value of rax, which contains malloc's return value,
	// and copy the name of our shared library to that address inside the
	// target process.
	ptrace_write(target_pid, remote_malloc_buf, libPath, libPathLength);
	//往remote_malloc_buf写入libpath
```



然后让target继续跑

```c
ptrace_f9(target_pid,1);
```

target会执行dlopen,打开libso

```c
	// call __libc_dlopen_mode() to load the shared library
	// __libc_dlopen_mode()无法直接通过dlsym()找到, 在静态的libc.so.6中也无法直接找到, __libc_dlopen_mode()好像是3个参数
	// 所以换位dlopen打开吧....
	asm(
		// get the address of __libc_dlopen_mode() off of the stack so we can call it
		"pop %rdx \n" // rdx = dlopen
		"push %r9 \n" // as before, save the previous value of r9 on the stack
		"mov %rdx,%r9 \n" //r9 = dlopen
		"mov %rax,%rdi \n" // rax = rdi = lib_soname
		"movabs $1,%rsi \n" // rsi = 1 = RTLD_LAZY
		"callq *%r9 \n" // call dlopen_mode
		"pop %r9 \n" // restore old r9 value
		"int $3" //暂停,让injector处理一下
	);
```

target执行了dlopen后,停下来,交给injector处理

```c
	// check out what the registers look like after calling dlopen. 
	//struct user_regs_struct dlopen_regs;
	memset(&regs, 0, sizeof(struct user_regs_struct));
	ptrace_getregs(target_pid, &regs);
	unsigned long long remote_libso_addr = regs.rax; //获取dlopen函数返回值

	// if rax is 0 here, then __libc_dlopen_mode failed, and we should bail
	// out cleanly.
	printf("[inject]: get remote %s at =%x\n",libname,remote_libso_addr);
	if(remote_libso_addr == 0)
	{
		fprintf(stderr, "__libc_dlopen_mode() failed to load %s\n", libname); //查看有没有加载成功
		restoreStateAndDetach(target_pid, remote_mem_rwx, backup, injectSharedLibrary_size, oldregs);
		free(backup);
		free(newcode);
		return 1;
	}

	// now check /proc/pid/maps to see whether injection was successful.
	if(checkloaded(target_pid, libname))
	{
		printf("[inject]: \"%s\" successfully injected\n", libname);
	}
	else
	{
		fprintf(stderr, "could not inject \"%s\"\n", libname);
	}
```

injector会通过dlopen的返回值确定是否加载成功

然后再读取`/proc/{pid}/maps`再次检测是否有加载成功

加载成功后,继续让target跑起来

```c
ptrace_f9(target_pid,1);
```

target会执行free()

```c
	// call free() to free the buffer we allocated earlier.
	//
	// Note: I found that if you put a nonzero value in r9, free() seems to
	// interpret that as an address to be freed, even though it's only
	// supposed to take one argument. As a result, I had to call it using a
	// register that's not used as part of the x64 calling convention. I
	// chose rbx.
	// 下面的free()函数感觉不一定要释放,^-^...
	asm(
		// at this point, rax should still contain our malloc()d buffer from earlier.
		// we're going to free it, so move rax into rdi to make it the first argument to free().
		//"mov %rax,%rdi \n" // rdi = rax = dlopen() ????
		"pop %rsi \n" // rsi = free()
		"push %rbx \n" // save previous rbx value
		"mov %rsi,%rbx \n" // rbx = rsi = free
		"xor %rsi,%rsi \n" // zero out rsi, because free() might think that it contains something that should be freed
		// break in so that we can check out the arguments right before making the call
		"int $3 \n" // 修改rdi为libso_path
		"callq *%rbx \n"// call free()
		"pop %rbx"// restore previous rbx value
	);
```

值得注意的是,在target里面,,以当前shellcode的状况,,我们已经搞丢了malloc开辟的内存地址

于是在执行call free之前,target停下来,,,把参数rdi修改为libso_path

```c
	// as a courtesy, free the buffer that we allocated inside the target
	// process. we don't really care whether this succeeds, so don't
	// bother checking the return value.
	ptrace_getregs(target_pid, &regs);
	regs.rdi = remote_libso_addr; //free(rdi = remote_libso_addr)
	ptrace_setregs(target_pid, &regs);
	ptrace_f9(target_pid,1); //执行到最后的int3
```

ps: 原项目并没有这样处理,他没有执行调用free,虽然在shellcode中写了free的调用

然后继续让target跑起来

```c
ptrace_f9(target_pid,1);
```

target会执行完free(libso_path),然后停下来

```c
	//最后停止
	asm(
		"int $3 \n"
	);
```

这样差不多,libso就加载完毕了

于是inject 恢复之前的old_regs寄存器环境,然后恢复被覆盖的字节码backup

```c
void restoreStateAndDetach(pid_t target, unsigned long remote_mem_rwx, void* backup, int datasize, struct REG_TYPE oldregs)
{
	ptrace_write(target, remote_mem_rwx, backup, datasize);//恢复之前的指令
	ptrace_setregs(target, &oldregs);//恢复之前的寄存器
	ptrace_detach(target);//detach
}
```

大概执行了detach, target会继续运行吧...QAQ

这样...一个libso的注入差不多就这样了

