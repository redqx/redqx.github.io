---
layout: post
title:  "(MikhailProg/elf)项目分析-elf加载器"
categories: [github-project]
---



# project

原项目: [ https://github.com/MikhailProg/elf]( https://github.com/MikhailProg/elf)

```
watch 5 ; fork 28 ; start 109 ; 
until 2024/08/20
```

当前项目:  [https://github.com/redqx/elfloader-MikhailProg](https://github.com/redqx/elfloader-MikhailProg) 可以用vscode生成和调试 ,含一些中文注释





该项目的功能:  

在内存中映射elf, 如果该elf含有interpreter, 继续展开interpreter

然后把程序的rip/eip指向入口点 ,该入口点可能是原elf的, 也可能是interpreter的

另外,在内存展开的过程中, 该项目只是做了内存映射和elf结构信息提取

重定位,符号获取什么的交给了interpreter



项目个人评价(菜鸡乱评价):

抛开elf加载来说, 该项目非常棒.....

就elf加载来谈,,,他把复杂的底层工作都交给了interpreter,没有自己去实现....感觉就失去了意义了



# project analysis



项目分为3个步骤

- 映射原elf

- 如果有interpreter, 也映射一下

- 修改av环境

- 去往入口点





0), 首先一开始来到start的地方, 获取argc,argv,envp, av

```c
	//(void)fini; //不知道这是干什么用的
 
	argc = (int)*(sp);
	argv = (char **)(sp + 1);
	//env = p = (char **)&argv[argc + 1];
	p = (char **)&argv[argc + 1];
	while (*p++ != NULL)
		;
	av = (void *)p;

	(void)env;
	if (argc < 2)
	{
		z_errx(1, "no input file");
	}

	file = argv[1];
```



1), 然后开始映射elf文件, 具体的操作可以理解为把PT_LOAD的段读取到内存中

然后根据p_flags属性设置内存属性

2), 接着是映射interpreter, 如果interpreter存在, 才映射

3), 然后来到av环境的修改, 以及argv

```c
	/* Reassign some vectors that are important for
	 * the dynamic linker and for lib C. */
#define AVSET(t, v, expr) case (t): (v)->a_un.a_val = (expr); break
	while (av->a_type != AT_NULL) 
	{
		switch (av->a_type) 
		{
			AVSET(AT_PHDR, av, base[Z_PROG] + ehdrs[Z_PROG].e_phoff);

			AVSET(AT_PHNUM, av, ehdrs[Z_PROG].e_phnum);

			AVSET(AT_PHENT, av, ehdrs[Z_PROG].e_phentsize);

			AVSET(AT_ENTRY, av, entry[Z_PROG]);

			AVSET(AT_EXECFN, av, (unsigned long)argv[1]);

			AVSET(AT_BASE, av, elf_interp ?base[Z_INTERP] : av->a_un.a_val);
		}
		++av;
	}
#undef AVSET
	++av;
// Z_PROG 是原elf
// Z_INTERP 是interpreter
z_memcpy(&argv[0], &argv[1],(unsigned long)av - (unsigned long)&argv[1]);
//当前指向文件从argv[0]变为了argv[1]
```

修改av环境是我一开始没看懂的,,,,到现在也只不过是看懂了代码什么意思,背后原理不知一二

该代码做的处理, 就是把elfloader的avx信息替换为待加载elf的avx信息, 涉及段头,段数量,入口点,基地址

memcpy做的处理也是一个替换, 替换的范围涵盖了av结构体

4), 修改argc个数, argc = argc - 1

```
	/* SP points to argc. */
	(*sp)--;
```

5), 去往入口点

```c
	z_trampo(
		(void (*)(void))(elf_interp ?entry[Z_INTERP] : entry[Z_PROG]), //arg1 入口点,会直接去往
		sp, //arg2
		z_fini //arg3
	);
	/* Should not reach. */
	z_exit(0);
```



关于函数 loadelf_anon(), 具体细节不再说, 就是mmap到内存,然后mprotect它的属性

另外interpreter会自动去处理INIT_ARRAY和FINITARRAY





# ELF loader



A small elf loader. It can load static and dynamically linked ELF EXEC and DYN (pie) binaries. The loader is PIE program that doesn't depend on libc and calls kernel services directly (z_syscall.c).

If the loader needs to load a dynamically linked ELF it places an interpreter (usually ld.so) and a requested binary into a memory and then calls the interpreter entry point.

## Build

Default build is for amd64:

```
$ make
```

Build for i386:

```
$ make ARCH=i386
```

Small build (exclude all messages and printf):

```
$ make SMALL=1
```

## Load binaries

Run basic hello world test:

```
$ ./test.sh 
default        : PASS
static         : PASS
pie            : PASS
static pie     : PASS
```

Run tests if the loader is built for i386:

```
$ M32= ./test.sh
...
```

Load ls:

```
$ ./loader /bin/ls
```

Load galculator:

```
$ ./loader /usr/bin/galculator
```





