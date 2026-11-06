#include "host_capabilities.h"

#include "vm.h"
#include "host_types.h"

#include <errno.h>
#include <string.h>
#include <sys/stat.h>

/* Browser preparation profile: no native POSIX capability dispatcher. */
static const char *browser_errno(int error)
{
    switch (error) {
    case ENOENT:
        return "not_found";
    case EACCES:
    case EPERM:
        return "permission_denied";
    case EEXIST:
        return "already_exists";
    case ENOTDIR:
        return "not_directory";
    case EISDIR:
        return "is_directory";
    case ELOOP:
        return "symlink_loop";
    default:
        return "io_error";
    }
}

Value *host_capability_call(VM *vm, const char *name, Value **arguments)
{
    if (!strcmp(name, "fs_metadata")) {
        if (!arguments[0] || arguments[0]->kind != V_PATH) {
            vm->error = "VM trap: filesystem requires Path";
            return NULL;
        }
        struct stat info;
        const char *path = (const char *)arguments[0]->as.bytes.data;
        if (lstat(path, &info)) {
            int error = errno;
            char *fields[] = {"operation", "code", "native_code"};
            Value *values[] = {value_data(V_STR, (const uint8_t *)name, strlen(name)),
                               value_data(V_STR, (const uint8_t *)browser_errno(error),
                                          strlen(browser_errno(error))),
                               value_size((size_t)error)};
            Value *record = values[0] && values[1] && values[2]
                                ? named_value(V_RECORD, "HostError", fields, values, 3)
                                : NULL;
            Value *result = host_variant("Error", record);
            for (size_t i = 0; i < 3; i++) release(values[i]);
            return result;
        }
        const char *kind = S_ISREG(info.st_mode)   ? "RegularFile"
                           : S_ISDIR(info.st_mode) ? "Directory"
                           : S_ISLNK(info.st_mode) ? "SymbolicLink"
                                                   : "OtherFile";
        char *fields[] = {"kind", "size"};
        Value *values[] = {named_value(V_VARIANT, kind, NULL, NULL, 0),
                           value_size(info.st_size < 0 ? 0 : (size_t)info.st_size)};
        Value *record = values[0] && values[1]
                            ? named_value(V_RECORD, "FileMetadata", fields, values, 2)
                            : NULL;
        for (size_t i = 0; i < 2; i++) release(values[i]);
        return host_variant("Ok", record);
    }
    vm->error = "VM trap: host capability unavailable in browser playground";
    return NULL;
}

/* Match the core's unsupported-platform contract for native-only adapters.
 * No handles can be created in this profile, so cleanup has nothing to release. */
static Value *browser_unsupported(const char *operation)
{
    char *names[] = {"operation", "code", "native_code"};
    Value *fields[] = {
        value_data(V_STR, (const uint8_t *)operation, strlen(operation)),
        value_data(V_STR, (const uint8_t *)"unsupported", 11), value_size(0)
    };
    Value *record = fields[0] && fields[1] && fields[2]
        ? named_value(V_RECORD, "HostError", names, fields, 3) : NULL;
    for (size_t i = 0; i < 3; i++) release(fields[i]);
    return host_variant("Error", record);
}

Value *digest_call(VM *vm, const char *name, Value **arguments)
{
    (void)vm; (void)arguments;
    return browser_unsupported(name);
}
void digest_destroy(VM *vm) { (void)vm; }

Value *gzip_stream_call(VM *vm, const char *name, Value **arguments)
{
    (void)vm; (void)arguments;
    return browser_unsupported(name);
}
void gzip_stream_destroy(VM *vm) { (void)vm; }

Value *filesystem_stage_call(VM *vm, const char *name, Value **arguments)
{
    (void)vm; (void)arguments;
    return browser_unsupported(name);
}
void filesystem_stage_destroy(VM *vm) { (void)vm; }
