# Workspace Owner is Clerk's org admin

A Workspace is a Clerk Organization. The User who creates it is the **Workspace Owner**. Clerk already assigns that User its Creator role (`org:admin`). We will not add a custom `org:owner` role or store ownership in our database.

Product copy may say “Owner.” Authorization checks use `org:admin`. The Owner is still uniquely the creator even if other members are later promoted to admin.
