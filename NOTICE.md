# Project Notice & Maintenance Policy

## Attribution and Credits

I have noticed an increasing number of projects using code from this fork without providing proper credit or attribution. In some cases, the original project identity and attribution have been removed or replaced with someone else's name, making it appear as though the work originated from them.

I want to make one thing clear: I have no objection to people forking, modifying, renaming, or building upon this project. That is part of what makes open-source software valuable.

However, removing the original credits and presenting someone else's work as your own is something I cannot simply overlook.

A considerable amount of time, effort, and thought has gone into the modifications and improvements made to this fork. Seeing that work reused without acknowledgment is genuinely disappointing.

**Please respect the original authors and maintain proper attribution when using, redistributing, or building upon this project's code.** Always comply with the applicable license terms.

## Future Development

Due to these circumstances, I have decided to discontinue further custom development of this fork after version **0.5.3**.

This does not mean the repository is being abandoned. Instead, its maintenance will be limited to following the upstream [Baileys](https://github.com/WhiskeySockets/Baileys) repository.

Future updates will primarily focus on:

- Keeping the fork synchronized with upstream Baileys.
- Updating `WAProto` when necessary.
- Updating the default socket version when necessary.

No further custom features, major modifications, or independent development efforts are planned beyond version 0.5.3.

## A Final Note

This decision was not made lightly. I genuinely enjoyed working on this project and improving it in my own way.

However, open-source collaboration should be built on mutual respect, not on taking someone else's efforts while erasing their contributions.

Thank you to everyone who has used this project, supported its development, and given proper credit along the way.

Your appreciation has meant more than you might realize.

---

# Elyrine Baileys Notice

Elyrine Baileys 1.0.0 is a fork of `@itsliaaa/baileys` 0.5.6 (itself a fork of WhiskeySockets/Baileys), maintained by **Lynx Decode (Arman Maulana)** with the community **Elyra Labs**, and customised for the Elyrine bot.

Original attribution, the notice above, and the MIT license terms of every upstream project are preserved. Code merged from other projects keeps its author credit:

- Elaina Baileys by Rexx Hayanasi: merged modules, VoIP (derived from ShellTear's `baileys-caller`).
- NIXCODE MessageBuilder by Nixel: the watermark in `lib/MessageBuilder/index.js` must stay, and the library must not be resold or redistributed as a standalone product.
- Axleys by axmisu: `newsletterCanPostStatus`, `albumParentKey`.

Elyrine-specific work: the adaptive link preview engine (`lib/Utils/link-preview.js`), `sendLinkPreview()`, packaging and renaming.

