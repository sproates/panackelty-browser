#include "host_capabilities.h"

#include "vm.h"

/* Browser preparation profile: no native POSIX capability dispatcher. */
Value *host_capability_call(VM *vm, const char *name, Value **arguments)
{
    (void)name;
    (void)arguments;
    vm->error = "VM trap: host capability unavailable in browser playground";
    return NULL;
}
