---
layout: post
title:  "dlsym原理分析(一)"
categories: [android,reverse-analysis] 
---



> key

没有section header的情况下,如何确定符号表个数

如何通过gnu_hash_table获取chains个数

如何通过gnu_hash_table获取符号表个数



# 前言

背景: 最近我在写一个elf的文件解析的GUI工具,  其中考虑到如下情况

- 如果elf有节表,我们可以通过`.dynamic`节找到动态符号表有多少个符号
- 如果elf没节表, 因为节表不是elf运行的必选项, 该如何找到符号表的数量???. 因为通过sym_tabel对应的table大小,我要去提取相关信息



elf运行, 以我的观点来看, 它不需要知道符号表的个数

因为它的动态加载机制是一种哈希查找, 直接通过index索引值遍历获取, 

在获取符号索引值期间, 符号表的个数不是他们查找的限制范围之一. 就像是 sym_idx=chains[xx]

xx不是通过`for i in rang(len(sym_table))的形式获取的`



接下来,是我通过阅读安卓源码, 初步的分析, elf动态加载机制是怎么获取符号的?

类似于 elf导入了printf,  我怎么拿到printf这个符号表对应的表项

源码网站 https://cs.android.com/android/platform/superproject/+/android14-qpr3-release:





# dlsym

首先搜索函数, 在 `//external/musl/src/ldso/dlsym.c`定位到如下 

```c
#include <dlfcn.h>
#include "dynlink.h"

void *dlsym(void *restrict so_handle, const char *restrict func_name)
{
	return __dlsym(so_handle, func_name, 0);
}
```

然后搜索 `__dlsym` 进入如下

```c
//external/musl/ldso/dynlink.c
hidden void *__dlsym(
	void *restrict so_handle, 
	const char *restrict func_name, 
	void *restrict ra)
{
	void *res;
	pthread_rwlock_rdlock(&lock);
	res = do_dlsym(so_handle, func_name, ra/*0*/);//ra=0
	pthread_rwlock_unlock(&lock);
	return res;
}

```

函数继续进入了`do_dlsym`, 继续跟进

```c
//external/musl/ldso/dynlink.c
static void *do_dlsym(struct dso *so_handle, const char *func_name, void *ra)
{
	int use_deps = 0;
	if (so_handle == head || so_handle == RTLD_DEFAULT) 
    {
		so_handle = head;
	} 
    else if (so_handle == RTLD_NEXT) 
    {
		so_handle = addr2dso((size_t)ra);
		if (!so_handle) 
            so_handle=head;
		so_handle = so_handle->next;
	} 
    else if (__dl_invalid_handle(so_handle)) 
    {
		return 0;
	} 
    else
	{
		use_deps = 1;
	}
    //---------------------------------------------------------
	struct symdef def = find_sym2(so_handle, func_name, 0, use_deps);//分析一下代码,好像是在这里获取了sym_table的index
	if (!def.sym) 
    {
		error("Symbol not found: %func_name", func_name);
		return 0;
	}
	if ((def.sym->st_info&0xf) == STT_TLS)
		return __tls_get_addr((tls_mod_off_t []){def.dso->tls_id, def.sym->st_value-DTP_OFFSET});
	if (DL_FDPIC && (def.sym->st_info&0xf) == STT_FUNC)
		return def.dso->funcdescs + (def.sym - def.dso->syms);
	return laddr(def.dso, def.sym->st_value);
}
```

分析一下代码,好像是在`find_sym2(so_handle, func_name, 0, use_deps);`获取了sym_table的index, 跟进函数

```c
static inline struct symdef find_sym2(struct dso *so_handle, const char *func_name, int need_def, int use_deps)
{
	uint32_t h = 0, hash1 = gnu_hash(func_name), hash1_div = hash1 / (8*sizeof(size_t)), *gnu_hash_table;
	size_t hash1_mod_mask = 1ul << (hash1 % (8*sizeof(size_t)));
	struct symdef def = {0};
	struct dso **deps = use_deps ? so_handle->deps : 0;

	for (; so_handle; so_handle=use_deps ? *deps++ : so_handle->syms_next) 
	{
		Sym *sym;
		if ((gnu_hash_table = so_handle->ghashtab)) //首选GNU_HASH_TABLE, 没有就HASH_TABLE
		{
			sym = gnu_lookup_filtered(
				hash1, 
				gnu_hash_table, 
				so_handle, 
				func_name, 
				hash1_div, 
				hash1_mod_mask
				);
		} 
		else 
		{
			if (!h) //一开始为0
			{
				h = sysv_hash(func_name);/*一种hash算法*/
				//然后更新h
			}
			sym = sysv_lookup(func_name, h, so_handle);
		}
		if (!sym) 
			continue;
		if (!sym->st_shndx)
			if (need_def || (sym->st_info&0xf) == STT_TLS|| ARCH_SYM_REJECT_UND(sym))
				continue;
		if (!sym->st_value)
			if ((sym->st_info&0xf) != STT_TLS)
				continue;
		if (!(1<<(sym->st_info&0xf) & OK_TYPES)) 
			continue;
		if (!(1<<(sym->st_info>>4) & OK_BINDS)) 
			continue;
		def.sym = sym;
		def.so_handle = so_handle;
		break;
	}
	return def;
}
static uint32_t gnu_hash(const char *s0)
{
	const unsigned char *s = (void *)s0;
	uint_fast32_t h = 5381;
	for (; *s; s++)
		h += h*32 + *s;
	return h;
}

```

初略分析一下代码, 发现如下情况

如果存在gnu_hash_table, 就去调用`gnu_lookup_filtered()`去gnu_hash_table找符号

不然去进入函数`sysv_lookup()` 去hash_table寻找



>  如何判断 是否存在gnu_hash_table和hash_table

这个在 `DYNAMIC` 的段头中, d_tag = GNU_HASH 或者 HASH, 表明了是否有对应的gnu_hash_table和hash_table

## gnu_lookup_filtered



先进入`gnu_lookup_filtered()函数`

传入了一些参数, 关注如下参数

```c
uint32_t hash1 = gnu_hash(func_name);
uint32_t hash1_div = hash1 / (8*sizeof(size_t)), *gnu_hash_table;
size_t hash1_mod_mask = 1ul << (hash1 % (8*sizeof(size_t)));
```

**hash1**通过调用函数gnu_hash()获取一个hash值

在x86中,sizeof(size_t)=4, x64中, sizeof(size_t)=8

(8*sizeof(size_t))就是对应长度的bit位个数



**hash1_div** 是hash1的值,除以bit位长度

**hash1_mod_mask** 是hash1的值,取模bit位长度, 得到的值作为1的左移长度

以x64为例, hash1的值被分解为

```
 hash1 / 0x44 = x ... y 
 z= 1<<y
```



**ps: 接了下来, 我们都以x64的情况为例**

**ps: 接了下来, 我们都以x64的情况为例**

**ps: 接了下来, 我们都以x64的情况为例**



然后我们继续跟进`gnu_lookup_filtered()`

```c
static Sym *gnu_lookup_filtered(
	uint32_t hash1, 
	uint32_t *gnu_hash_table, 
	struct dso *so_handle, 
	const char *func_name, 
	uint32_t hash1_div, 
	size_t hash1_mode_mask
	)
{
	uint32_t bloomSize = gnu_hash_table[2];
	uint32_t bloomShift = gnu_hash_table[3];
	const size_t *blooms = (const void *)(gnu_hash_table+4);//获取数组blooms
    uint32_t mask2 = bloomSize-1 ;// bloomSize貌似都是2^xx的形式
	size_t bloom = blooms[hash1_div & mask2]; 
    
	if (!(bloom & hash1_mode_mask)) //hash1_mode_mask大概是 0b10000000000这种形式
		return 0;//hash1_mode_mask对应的bit位是0

	bloom = bloom >> (hash1 >> bloomShift) % (8 * sizeof bloom);
	//bloom = bloom >> ((hash1 >> bloomShift) % 64);
	if (!(bloom & 1)) 
		return 0;

	return gnu_lookup(hash1, gnu_hash_table, so_handle, func_name);
}
/*
 hash1 / 0x44 = x ... y 
 z= 1<<y
 */
```

通过计算, 得到的 ` blooms[x&mask2] & (1<<y) ` , 

如果位运算结果是0, 取消查找,直接返回.

接着继续判断,  bloom = bloom >> ( (hash1 >> bloomShift) % 0x40)

如果 bloom & 1, 结果是0, 取消查找, 直接返回

在以上2种判断下, 假设都不为0, 那就继续查找, 跟进函数` gnu_lookup()`

```c

static Sym *gnu_lookup(
	uint32_t hash1, 
	uint32_t *gnu_hash_table, 
	struct dso *so_handle, 
	const char *func_name
	)
{
	uint32_t nbuckets = gnu_hash_table[0];
	uint32_t symndx = gnu_hash_table[1];
	uint32_t bloomSize = gnu_hash_table[2];
	
	uint32_t *buckets = gnu_hash_table + 4 + bloomSize * (sizeof(size_t)/4);
	uint32_t *chanis = buckets + nbuckets;

	/*
	(sizeof(size_t)/4) = 1 in x86
	(sizeof(size_t)/4) =2 in x64
	*/
	uint32_t i = buckets[hash1 % nbuckets];//拿的是一个迭代的初始值

	if (!i) //拿到0就算了
		return 0;

	uint32_t *hashval = chanis + (i - symndx);//每一个i都是在以symndx为基础??

	for (hash1 |= 1; ; i++) 
	{
		uint32_t chain = *hashval++;
		if (
			(hash1 == (chain|1)) //这里可以看到并没有使用chain|=1
			&& (!so_handle->versym || so_handle->versym[i] >= 0)
		    && !strcmp(func_name, so_handle->strings + so_handle->syms[i].st_name))
		{
			return so_handle->syms+i;
		}
			
		if (chain & 1) //最低位是1 也g...
		{
			break;
		}
	}
	return 0;
}

```



首先通过 hash1, 获取一个i值, `i = buckets[hash1 % nbuckets];`

这个`i`值将会被作为一个sym_table的起始索引值, 

同时`i - symndx`也会作为一个hash桶(hash数组)的起始索引值



如果i = 0, 说明是一个空符号? 或者不存在该符号? 然后直接返回0

通过 i - symndx获取一个起始的hashval数组 , `uint32_t *hashval = chanis + (i - symndx)`

接着就是顺序性的判断

如果得打到 chain | 1 和hash1相等, 并且对应的sym_table[i].st_name 和func_name也是相等的,大概就说明找到符号了

如果没找到, 同时chain&1 结果是0, 那就继续查找, 不然没找到, 退出



这大概就是一个符号通过gnu_hash的方式查找...

> 那么问题来了? sym_table的大小是多少?



多加分析可以发现, 假设在没有 func_name的情况下, 直接来到函数`gnu_lookup()`

我们理想情况下, 会有一个i值 `i = buckets[hash1 % nbuckets];`

这个i会作为sym_table的索引值, 



> 是不是可以认为buckets中, 涵盖所有的i 值呢?

实际查看某个kali_x64_libc.so.6文件,

发现buckets的长度和len(sym_table)的数量相差很大

比如buckets有0x3ff给成员, 但sym_table有0xC08个成员

为什么会这样??? 

既然buckets没有那么多索引值, 如何索引到对应的符号???

因为后面还会有判断的推进, 比如chain&1, hashval++ , i++

```c
	for (hash1 |= 1; ; i++) 
	{
		uint32_t chain = *hashval++;
		if (
			(hash1 == (chain|1)) //这里可以看到并没有使用chain|=1
			&& (!so_handle->versym || so_handle->versym[i] >= 0)
		    && !strcmp(func_name, so_handle->strings + so_handle->syms[i].st_name))
		{
			return so_handle->syms+i;
		}
			
		if (chain & 1) //最低位是1 也g...
		{
			break;
		}
	}
```



在kali_x64_libc.so.6, 同时也发现, 最大的buckets[]值 + 1 ,就是sym_table的长度

所以可以 初略简单的认为 i_max = bucket_max + 1 = len(sym_table)

当然更加准确的理解,应该是 (i_max + 1) <= len(sym_table)



> chains的数量是多少???

chains_len = len(sym_table) - symndx



## sysv_lookup

假如没有DT_GNU_HASH对应的d_tag, 我们就要去hash_table查找函数

我们进入函数 sysv_lookup()



```c
#include <dlfcn.h>
#include "dynlink.h"
static Sym *sysv_lookup(const char *func_name, uint32_t hash, struct dso *so_handle)
{
	size_t i;
	Sym *syms = so_handle->syms;
	//Elf_Symndx *hashtab = so_handle->hashtab;
    uint32_t* hashtab = so_handle->hashtab;
    uint32_t nbucket = hashtab[0];
    uint32_t* buckets = hashtab + 2 ;
    uint32_t* chains = buckets + nbucket;
    
    char *strings = so_handle->strings;
    i=buckets[hash%nbucket];
    //i = 0 直接over
	for (; i ; i=chains[i]) 
    {
		if ((!so_handle->versym || so_handle->versym[i] >= 0)
		    && (!strcmp(func_name, strings+syms[i].st_name)))
        {
            return syms+i;
        }
	}
	return 0;
}
static uint32_t sysv_hash(const char *s0) //0结尾的字符串
{
    const unsigned char *s = (void *)s0;
    uint_fast32_t h = 0;
    while (*s) 
    {
        h = 16*h + *s++;
        h ^= h>>24 & 0xf0;
    }
    return h & 0xfffffff;
}
```



首先通过hash 获取一个i值 `i=buckets[hash%nbucket];`

这个 `i` 作为 sym_tables的起始索引值

然后遍历, i的数值更新是 `i=chains[i]` , 而不是i++



> 我们可不可以认为, buckets涵盖了所有sym_table的索引值

通过kali_x64_libc.so.6发现, buckets的数量是远远小于sym_table的



>  那么我们可不可以认为, chains中含有所有的sym_table的index

相比较于gnu_lookup的查找, sysv_lookup的查找比较单一,

i的获取直接在chains[]中拿, 拿不到就g掉

所以chains中应该含有所有的sym_table索引值

可以认为chains[]的数量就是符号表的个数



# 小结

在hash_table中, hash_table.nchain 就是符号表个数

在gnu_hash_table中, max(gnu_hash_table.buckets[]) + 1<= len(sym_table)

没有hash_table, 可以不妥,简单的认为 sym_table的个数 = max(gnu_hash_table.buckets[])  +1





# 后续



在 GNU_HASH table 中,我粗略的认为 buckets中, 最大的bucket值可以作为 dynsym_table的符号个数

在有限的知识内,这当然是不妥的, 于是在之后还是碰到了这个bug, 获取的**max_bucket + 1** `!=`  len( dynsym_table)

那该怎么办?? 于是更新了方案



假如通过 max_bucket 拿到的chain值不是一个有效的符号, 也就说

```
chani & 1 !=0 成立
```

那么我们就需要继续遍历, 往 max_bucket 之后遍历, 每遍历一次, 我们的自定义获取的 len_sym就会 ++



一份局部的python代码如下

```
    while mm_GnuHashTable.chains[-1].value & 1 == 0:
        chani = read_file_from_struct(file, mm_Elf32_Word)
        mm_GnuHashTable.chains.append(chani.item)
        sym_table_cnt += 1
```

完整的python 参考代码如下

```python
def parse_dynamic_GNU_HASH(
        file: _BufferedIOBase,
        dyn_items_organize: Dict[str, Union[Dynamic32, Dynamic64]],
        elf_classe: str,
) -> Tuple[GnuHashTable, Any]:
    dict_keys = dyn_items_organize.keys()
    if 'DT_GNU_HASH' not in dict_keys:
        return (None, 0)

    mm_gnu_hash = dyn_items_organize['DT_GNU_HASH']

    file.seek(mm_gnu_hash.d_value.value)
    mm_GnuHashTable: GnuHashTable = read_file_from_struct(file, GnuHashTable)
    mm_GnuHashTable.blooms = []

    bloom_type = mm_Elf32_Word

    if elf_classe == '64':
        bloom_type = mm_Elf64_Xword
    for i in range(mm_GnuHashTable.bloomSize.value):
        bloom = read_file_from_struct(file, bloom_type)
        mm_GnuHashTable.blooms.append(bloom.item)

    mm_GnuHashTable.buckets = []
    sym_table_idx_max = 0
    for i in range(mm_GnuHashTable.nbucket.value):
        bucket = read_file_from_struct(file, mm_Elf32_Word)
        mm_GnuHashTable.buckets.append(bucket.item)
        if sym_table_idx_max < bucket.item.value:
            sym_table_idx_max = bucket.item.value

            
    if sym_table_idx_max < mm_GnuHashTable.symndx.value:  #可以寻到的最大值都小于symdnx, 那就没意思了
        sym_table_cnt = mm_GnuHashTable.symndx.value #数量
    else:
        sym_table_cnt = sym_table_idx_max + 1 #符号的数量


    # sym_table_cnt是符号的数量,不是chains的数量
    # sym_table_cnt = len(sym_table) = len(chains) + symndx

    nchain = sym_table_cnt - mm_GnuHashTable.symndx.value
    mm_GnuHashTable.chains = []
    for i in range(nchain):
        chani = read_file_from_struct(file, mm_Elf32_Word)
        mm_GnuHashTable.chains.append(chani.item)
        #print(chani.value & 1)

    # 此刻大概是读取到末尾了,但不一定是末尾
    # 尝试再读取
    while mm_GnuHashTable.chains[-1].value & 1 == 0:
        chani = read_file_from_struct(file, mm_Elf32_Word)
        mm_GnuHashTable.chains.append(chani.item)
        sym_table_cnt += 1

    return (
        mm_GnuHashTable,
        sym_table_cnt
    )

```



