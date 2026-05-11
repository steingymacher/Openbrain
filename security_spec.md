# Security Specification for Smart Supermarket & Greenhouse

## Data Invariants
1. A **User Profile** can only be created/modified by the owner. Admins can view/manage.
2. **Product Prices** and **Products** are read-only for public, write-only for Admins.
3. **Greenhouse Status** is read-only for public, updateable by greenhouse sensors (conceptually) or Admins.
4. **Plant Records** are managed by Admins.
5. **Orders** are created by users and only readable by the owner or Admins.
6. **Marketplace Offers** are created by users. Anyone can read active offers. Owners/Admins can delete/update.
7. **Chats** are private between participants.
8. **Messages** are private to chat participants.

## The Dirty Dozen Payloads (Rejection Targets)
1. **Identity Theft**: Creating a UserProfile for another UID.
2. **Admin Spoofing**: Setting `role: 'admin'` in a user-created profile.
3. **Price Manipulation**: A non-admin updating a product price.
4. **Order Hijacking**: Reading someone else's order history.
5. **Unauthorized Listing**: Editing someone else's marketplace offer.
6. **Chat Eavesdropping**: Listing chats you aren't a participant in.
7. **Message Injection**: Sending a message to a chat you aren't in.
8. **State Jumping**: Transitioning an order from `pending` to `completed` without proper authorization.
9. **Spam IDs**: Document IDs exceeding 128 characters or containing junk.
10. **Shadow Fields**: Adding undocumented fields like `verified: true` to a marketplace offer.
11. **Timestamp Spoofing**: Providing a client-side `createdAt` timestamp instead of `serverTimestamp()`.
12. **Immortal Field Mutation**: Changing the `userId` of an existing marketplace offer.

## Test Runner (Initial Draft)
(See firestore.rules.test.ts logic within the rules generation phase)
