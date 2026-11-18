// SPDX-License-Identifier: AGPL-3.0-only
// Application policy in SOP Lang. The receiver supplies the real tool and observation facts.
export default `
@mode.make std.capability.mode act=make target=new
@mode.change std.capability.mode act=change target=existing requireResult=true selector=true selectorUnique=true
@mode.place std.capability.mode act=place target=existing requireResult=true
@mode.remove std.capability.mode act=remove target=existing

@seed.kind std.capability.seed parameter="kind" source=kind phase=initial order=10 required=true replace=true
@seed.identities std.capability.seed parameter="ids" source=target.list phase=initial order=11 replace=true
@seed.identity std.capability.seed parameter="id" source=target.id phase=initial order=12 unlessParameter="ids" replace=true
@seed.allocation std.capability.seed act=make parameter="id" source=fresh.id phase=initial order=13 parameterRequired=true replace=true
@seed.name std.capability.seed parameter="name" source=target.name phase=initial order=30
@seed.title std.capability.seed act=make parameter="title" source=name.or.label phase=missing order=100 parameterRequired=true notice="I used {value} as the title."
@seed.label std.capability.seed act=make parameter="label" source=name.or.label phase=missing order=101 parameterRequired=true notice="I used {value} as the name."

@guard.document std.capability.guard operation="document.write" when=active.signal signal=document.populated reason=overwrite-needs-stricter-admission message="The document already has content. I left it unchanged."
@guard.calendar std.capability.guard operation="calendar.meeting.add" when=incomplete.coverage reason=unapplied-scheduling-details message="I understood a meeting, but could not apply its scheduling details. Nothing changed."

@document std.capability.object on="docs.editor.document" scope=?scope
@document.title std.capability.field object=$document key="title" value=?title
@document.named core.check fn=neq args=?title args=""
@document.block std.capability.object on="docs.editor.block" scope=?scope
@document.section std.capability.object on="docs.editor.section" scope=?scope
@document.occupied std.capability.signal scope=?scope name=document.populated
@document.by.title core.rule when=$document when=$document.title if=$document.named then=$document.occupied
@document.by.block core.rule when=$document.block then=$document.occupied
@document.by.section core.rule when=$document.section then=$document.occupied
`;
