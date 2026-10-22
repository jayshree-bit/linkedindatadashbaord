import * as svc from "../services/user.service.js";
const wrap = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    next(e);
  }
};

export const getUsers = wrap(() => svc.listUsers());
export const getRoles = wrap(() => svc.listRoles());
export const addUser = wrap((req) => svc.createUser(req.body));
export const editUser = wrap((req) => svc.updateUser(req.params.id, req.body));
export const removeUser = wrap(async (req) => {
  await svc.deleteUser(req.params.id, req.user._id);
  return { ok: true };
});
export const editRole = wrap((req) =>
  svc.updateRolePermissions(req.params.id, req.body.permissions),
);
