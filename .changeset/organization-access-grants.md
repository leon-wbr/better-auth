---
"better-auth": minor
---

The organization plugin's new `grants` option gives permissions to callers by who they are, such as platform admins or a specific user, including in organizations they aren't a member of.

Each grant pairs a `when` check with a role from your access control instance:

```ts
organization({
  ac,
  roles: { owner, admin, member },
  grants: [
    {
      when: ({ user }) => user.role === "admin",
      role: ac.newRole({ organization: ["update", "delete"] }),
    },
  ],
});
```

A matching grant adds its permissions to every permission check in that organization and lets the caller read it. It doesn't make them a member, so `getActiveMember` and checks on the creator role still need a member row.
