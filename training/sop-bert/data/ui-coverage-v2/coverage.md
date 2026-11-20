# Coverage: operation x parameter, before and after ui-coverage-v2

Produced by `coverage.py`. **Before** = the official dataset as built on disk (48,102 rows incl. augmented copies; 44,336 non-augmented rows counted). **New** = this corpus (3,180 rows). **After** = before + new. Target: every case at least 20 rows. **Human-named** = before, counting only rows whose text has no slot or tool id (o1, r2, b3, a1, hair_front, chart:1); people do not write those, so they do not cover how a case is asked.

Attribution: a row's own operation when it names a current operation and has one request; otherwise its labels (tab, target type, act, constraint keys). A row counts for every case whose keys it carries; new rows also count for the case they were authored for. Counts are rows, not distinct meanings.

## Summary

| tab | world | operations | declared parameters | cases | cases with 0 human-named rows before | cases < 20 human-named before | cases < 20 human-named after | new rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| drawing | art.draw | 21 | 55 | 55 | 4 | 10 | 0 | 651 |
| diagram | diagram.sketch | 28 | 66 | 61 | 16 | 24 | 0 | 824 |
| calendar | time.calendar | 17 | 47 | 40 | 14 | 23 | 0 | 642 |
| document | docs.editor | 27 | 81 | 56 | 12 | 13 | 0 | 648 |
| avatar | ui.avatar | 19 | 31 | 29 | 5 | 7 | 0 | 415 |
| **all** | | 112 | 280 | 241 | 51 | 77 | 0 | 3,180 |

## drawing (art.draw)

### Cases

| case | keys | before | before, human-named | new | after | after, human-named |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `drawing.object.make:kind-only` | @kind | 11,343 | 11,343 | 110 | 11,453 | 11,453 |
| `drawing.object.make:color` | @kind drawn.color | 2,116 | 2,116 | 18 | 2,134 | 2,134 |
| `drawing.object.make:size-number` | @kind drawn.size@eq | 101 | 101 | 10 | 111 | 111 |
| `drawing.object.make:size-degree` | @kind drawn.size@degree | 687 | 687 | 15 | 702 | 702 |
| `drawing.object.make:position` | @kind drawn.x drawn.y | 74 | 74 | 10 | 84 | 84 |
| `drawing.object.make:region` | @kind drawn.at@region | 21 | 21 | 13 | 34 | 34 |
| `drawing.object.make:dimensions` | @kind drawn.width drawn.height | 160 | 160 | 11 | 171 | 171 |
| `drawing.object.make:label` | @kind drawn.label | 174 | 174 | 10 | 184 | 184 |
| `drawing.object.make:name` | @kind drawn.name | 3,202 | 3,202 | 10 | 3,212 | 3,212 |
| `drawing.object.make:relation` | @kind drawn.relation@relation | 5,145 | 5,145 | 14 | 5,159 | 5,159 |
| `drawing.object.make:multi` | @kind #multi | 2,765 | 2,765 | 27 | 2,792 | 2,792 |
| `drawing.catalog.make:kind-only` | @kind | 1,011 | 1,011 | 27 | 1,038 | 1,038 |
| `drawing.catalog.make:position` | @kind drawn.x drawn.y | 22 | 22 | 9 | 31 | 31 |
| `drawing.catalog.make:size` | @kind drawn.size | 23 | 23 | 9 | 32 | 32 |
| `drawing.object.change:color` | drawn.color | 2,896 | 2,896 | 22 | 2,918 | 2,918 |
| `drawing.object.change:size-number` | drawn.size@eq | 532 | 513 | 12 | 544 | 525 |
| `drawing.object.change:size-relative` | drawn.size@delta | 155 | 154 | 16 | 171 | 170 |
| `drawing.object.change:dimensions` | drawn.width drawn.height | 72 | 54 | 31 | 103 | 85 |
| `drawing.object.change:position` | drawn.x drawn.y | 70 | 50 | 9 | 79 | 59 |
| `drawing.object.change:label` | drawn.label | 100 | 79 | 11 | 111 | 90 |
| `drawing.object.change:name` | drawn.name | 1 | 1 | 26 | 27 | 27 |
| `drawing.object.change:multi` | #multi | 169 | 146 | 46 | 215 | 192 |
| `drawing.object.change:selected` | @ctx | 121 | 121 | 14 | 135 | 135 |
| `drawing.object.select:core` | (any) | 62 | 62 | 10 | 72 | 72 |
| `drawing.objects.select:core` | #sel2 | 30 | 29 | 8 | 38 | 37 |
| `drawing.object.place:position` | drawn.x drawn.y | 61 | 60 | 11 | 72 | 71 |
| `drawing.object.place:direction` | drawn.direction | 21 | 21 | 12 | 33 | 33 |
| `drawing.object.place:region` | drawn.at@region | 0 | 0 | 29 | 29 | 29 |
| `drawing.object.place:relation` | drawn.relation@relation | 2,437 | 2,437 | 12 | 2,449 | 2,449 |
| `drawing.object.place:selected` | @ctx | 21 | 21 | 10 | 31 | 31 |
| `drawing.objects.transform:core` | #sel2 drawn.width drawn.height | 29 | 4 | 25 | 54 | 29 |
| `drawing.page.clear:core` | (any) | 30 | 30 | 9 | 39 | 39 |
| `drawing.object.remove:core` | (any) | 36 | 35 | 34 | 70 | 69 |
| `drawing.object.remove:selected` | @ctx | 0 | 0 | 25 | 25 | 25 |
| `drawing.ids.show:temporary` | page.mode=temporary | 0 | 0 | 23 | 23 | 23 |
| `drawing.ids.show:duration` | page.duration | 37 | 37 | 9 | 46 | 46 |
| `drawing.ids.show:always` | page.mode=always | 0 | 0 | 22 | 22 | 22 |
| `drawing.ids.show:off` | page.mode=off | 1 | 1 | 23 | 24 | 24 |
| `drawing.observe:describe` | ?describe | 52 | 52 | 15 | 67 | 67 |
| `drawing.observe:count` | ?count | 105 | 105 | 9 | 114 | 114 |
| `drawing.observe:exists` | ?exists | 104 | 104 | 9 | 113 | 113 |
| `drawing.undo:core` | (any) | 29 | 29 | 9 | 38 | 38 |
| `drawing.redo:core` | (any) | 30 | 30 | 9 | 39 | 39 |
| `drawing.object.parts:core` | ?describe | 31 | 31 | 9 | 40 | 40 |
| `drawing.part.select:by-index` | part.index | 34 | 34 | 9 | 43 | 43 |
| `drawing.part.select:by-name` | @name | 37 | 13 | 34 | 71 | 47 |
| `drawing.part.change:color` | part.color | 116 | 95 | 9 | 125 | 104 |
| `drawing.part.change:dimensions` | part.width part.height | 52 | 30 | 9 | 61 | 39 |
| `drawing.part.place:position` | part.x part.y | 92 | 68 | 9 | 101 | 77 |
| `drawing.part.remove:core` | (any) | 71 | 47 | 9 | 80 | 56 |
| `drawing.part.extract:core` | (any) | 59 | 59 | 9 | 68 | 68 |
| `drawing.object.group:core` | #sel2 | 32 | 8 | 57 | 89 | 65 |
| `drawing.object.group:name` | drawn.name | 39 | 20 | 9 | 48 | 29 |
| `drawing.object.group:label` | drawn.label | 37 | 19 | 23 | 60 | 42 |
| `drawing.object.ungroup:core` | (any) | 60 | 33 | 9 | 69 | 42 |

### Operation x parameter (requests carrying the parameter)

| operation | parameter | required | reader keys | before | new | after |
| --- | --- | :---: | --- | ---: | ---: | ---: |
| `drawing.object.make` | kind | yes | @kind | 11,343 | 110 | 11,453 |
| `drawing.object.make` | name |  | drawn.name | 3,202 | 10 | 3,212 |
| `drawing.object.make` | label |  | drawn.label | 174 | 10 | 184 |
| `drawing.object.make` | width |  | drawn.width | 287 | 11 | 298 |
| `drawing.object.make` | height |  | drawn.height | 192 | 10 | 202 |
| `drawing.object.make` | x |  | drawn.x | 106 | 9 | 115 |
| `drawing.object.make` | y |  | drawn.y | 106 | 10 | 116 |
| `drawing.object.make` | size |  | drawn.size | 789 | 25 | 814 |
| `drawing.object.make` | color |  | drawn.color | 2,116 | 18 | 2,134 |
| `drawing.catalog.make` | name | yes | @kind | 1,011 | 27 | 1,038 |
| `drawing.catalog.make` | x |  | drawn.x | 24 | 9 | 33 |
| `drawing.catalog.make` | y |  | drawn.y | 24 | 9 | 33 |
| `drawing.catalog.make` | size |  | drawn.size | 23 | 9 | 32 |
| `drawing.object.change` | ids | yes | @ref | 4,102 | 122 | 4,224 |
| `drawing.object.change` | name |  | drawn.name | 1 | 27 | 28 |
| `drawing.object.change` | label |  | drawn.label | 100 | 11 | 111 |
| `drawing.object.change` | width |  | drawn.width | 220 | 33 | 253 |
| `drawing.object.change` | height |  | drawn.height | 259 | 31 | 290 |
| `drawing.object.change` | x |  | drawn.x | 102 | 9 | 111 |
| `drawing.object.change` | y |  | drawn.y | 102 | 8 | 110 |
| `drawing.object.change` | size |  | drawn.size | 688 | 28 | 716 |
| `drawing.object.change` | color |  | drawn.color | 2,896 | 22 | 2,918 |
| `drawing.object.select` | id | yes | @ref | 62 | 10 | 72 |
| `drawing.objects.select` | ids | yes | @ref | 38 | 8 | 46 |
| `drawing.object.place` | ids | yes | @ref | 2,521 | 64 | 2,585 |
| `drawing.object.place` | x | yes | drawn.x | 61 | 11 | 72 |
| `drawing.object.place` | y | yes | drawn.y | 61 | 11 | 72 |
| `drawing.objects.transform` | ids | yes | @ref | 37 | 0 | 37 |
| `drawing.objects.transform` | x | yes | drawn.x | 37 | 0 | 37 |
| `drawing.objects.transform` | y | yes | drawn.y | 37 | 0 | 37 |
| `drawing.objects.transform` | width | yes | drawn.width | 37 | 0 | 37 |
| `drawing.objects.transform` | height | yes | drawn.height | 37 | 0 | 37 |
| `drawing.page.clear` | (none) | | | | | |
| `drawing.object.remove` | ids | yes | @ref | 36 | 34 | 70 |
| `drawing.ids.show` | mode | yes | page.mode | 47 | 64 | 111 |
| `drawing.ids.show` | duration |  | page.duration | 37 | 9 | 46 |
| `drawing.observe` | (none) | | | | | |
| `drawing.undo` | (none) | | | | | |
| `drawing.redo` | (none) | | | | | |
| `drawing.object.parts` | id | yes | @ref | 39 | 3 | 42 |
| `drawing.part.select` | id | yes | part.id | 0 | 0 | 0 |
| `drawing.part.select` | index | yes | part.index | 34 | 9 | 43 |
| `drawing.part.change` | id | yes | part.id | 0 | 0 | 0 |
| `drawing.part.change` | index | yes | part.index | 167 | 2 | 169 |
| `drawing.part.change` | color |  | part.color | 116 | 9 | 125 |
| `drawing.part.change` | width |  | part.width | 83 | 8 | 91 |
| `drawing.part.change` | height |  | part.height | 84 | 8 | 92 |
| `drawing.part.place` | id | yes | part.id | 0 | 0 | 0 |
| `drawing.part.place` | index | yes | part.index | 67 | 1 | 68 |
| `drawing.part.place` | x | yes | part.x | 92 | 9 | 101 |
| `drawing.part.place` | y | yes | part.y | 92 | 9 | 101 |
| `drawing.part.remove` | id | yes | part.id | 0 | 0 | 0 |
| `drawing.part.remove` | index | yes | part.index | 46 | 1 | 47 |
| `drawing.part.extract` | id | yes | part.id | 0 | 0 | 0 |
| `drawing.part.extract` | index | yes | part.index | 34 | 1 | 35 |
| `drawing.object.group` | ids | yes | @ref | 65 | 57 | 122 |
| `drawing.object.group` | name |  | drawn.name | 39 | 9 | 48 |
| `drawing.object.group` | label |  | drawn.label | 37 | 23 | 60 |
| `drawing.object.ungroup` | id | yes | @ref | 60 | 9 | 69 |

## diagram (diagram.sketch)

### Cases

| case | keys | before | before, human-named | new | after | after, human-named |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `diagram.node.make:kind` | @kind | 4,344 | 4,344 | 63 | 4,407 | 4,407 |
| `diagram.node.make:label` | node.label | 3,986 | 3,986 | 13 | 3,999 | 3,999 |
| `diagram.node.make:count` | node.n | 160 | 160 | 15 | 175 | 175 |
| `diagram.node.make:colour` | node.colour | 2,081 | 2,081 | 15 | 2,096 | 2,096 |
| `diagram.node.make:size` | node.size | 147 | 147 | 14 | 161 | 161 |
| `diagram.node.make:layout` | node.layout | 81 | 81 | 9 | 90 | 90 |
| `diagram.node.make:position` | node.x node.y | 97 | 97 | 9 | 106 | 106 |
| `diagram.node.make:multi` | #multi | 2,127 | 2,127 | 19 | 2,146 | 2,146 |
| `diagram.node.change:colour` | node.colour | 2,044 | 2,023 | 14 | 2,058 | 2,037 |
| `diagram.node.change:size` | node.size@eq | 3 | 3 | 23 | 26 | 26 |
| `diagram.node.change:size-relative` | node.size@delta | 115 | 113 | 11 | 126 | 124 |
| `diagram.node.change:label` | node.label | 38 | 18 | 25 | 63 | 43 |
| `diagram.node.change:value` | node.value | 50 | 32 | 8 | 58 | 40 |
| `diagram.node.change:selected` | @ctx | 65 | 65 | 16 | 81 | 81 |
| `diagram.node.select:core` | (any) | 84 | 36 | 31 | 115 | 67 |
| `diagram.node.select:with-links` | node.edges | 16 | 0 | 22 | 38 | 22 |
| `diagram.node.remove:core` | (any) | 29 | 5 | 44 | 73 | 49 |
| `diagram.node.remove:selected` | @ctx | 0 | 0 | 22 | 22 | 22 |
| `diagram.node.place:position` | node.x node.y | 58 | 12 | 22 | 80 | 34 |
| `diagram.node.place:region` | node.at@region | 0 | 0 | 24 | 24 | 24 |
| `diagram.node.resize:dimensions` | node.width node.height | 57 | 12 | 22 | 79 | 34 |
| `diagram.node.layout:layout` | node.layout | 51 | 27 | 9 | 60 | 36 |
| `diagram.link.make:core` | link.from link.to | 2,402 | 2,378 | 10 | 2,412 | 2,388 |
| `diagram.link.make:from-selection` | link.to !link.from | 0 | 0 | 22 | 22 | 22 |
| `diagram.link.select:core` | (any) | 57 | 31 | 8 | 65 | 39 |
| `diagram.link.change:label` | link.label | 103 | 33 | 9 | 112 | 42 |
| `diagram.link.change:colour` | link.colour | 113 | 39 | 8 | 121 | 47 |
| `diagram.link.change:style` | link.style | 95 | 22 | 9 | 104 | 31 |
| `diagram.link.change:arrow` | link.arrow | 103 | 33 | 8 | 111 | 41 |
| `diagram.link.change:width` | link.width | 98 | 27 | 8 | 106 | 35 |
| `diagram.link.change:reconnect` | link.to@result | 0 | 0 | 22 | 22 | 22 |
| `diagram.link.remove:core` | (any) | 51 | 24 | 8 | 59 | 32 |
| `diagram.selection.remove:core` | sketch.nodes sketch.links | 27 | 0 | 22 | 49 | 22 |
| `diagram.page.clear:core` | (any) | 26 | 26 | 8 | 34 | 34 |
| `diagram.ids.show:temporary` | page.mode=temporary | 0 | 0 | 22 | 22 | 22 |
| `diagram.ids.show:duration` | page.duration | 20 | 20 | 8 | 28 | 28 |
| `diagram.ids.show:always` | page.mode=always | 0 | 0 | 23 | 23 | 23 |
| `diagram.ids.show:off` | page.mode=off | 0 | 0 | 22 | 22 | 22 |
| `diagram.observe:describe` | ?describe | 27 | 27 | 8 | 35 | 35 |
| `diagram.observe:count` | ?count | 0 | 0 | 22 | 22 | 22 |
| `diagram.observe:exists` | ?exists | 0 | 0 | 22 | 22 | 22 |
| `diagram.undo:core` | (any) | 26 | 26 | 8 | 34 | 34 |
| `diagram.redo:core` | (any) | 24 | 24 | 8 | 32 | 32 |
| `diagram.group.make:core` | group.ids | 30 | 0 | 64 | 94 | 64 |
| `diagram.group.make:name` | group.name | 30 | 0 | 23 | 53 | 23 |
| `diagram.group.make:label` | group.label | 21 | 0 | 22 | 43 | 22 |
| `diagram.group.select:core` | (any) | 28 | 3 | 22 | 50 | 25 |
| `diagram.group.change:label` | group.label | 52 | 30 | 8 | 60 | 38 |
| `diagram.group.change:colour` | group.colour | 51 | 27 | 11 | 62 | 38 |
| `diagram.group.change:size` | group.size | 51 | 28 | 9 | 60 | 37 |
| `diagram.group.layout:layout` | group.layout | 60 | 59 | 8 | 68 | 67 |
| `diagram.group.resize:scale-number` | group.scale@eq | 35 | 11 | 22 | 57 | 33 |
| `diagram.group.resize:scale-relative` | group.scale@delta | 1 | 1 | 23 | 24 | 24 |
| `diagram.group.place:position` | group.x group.y | 36 | 36 | 8 | 44 | 44 |
| `diagram.group.remove:core` | (any) | 28 | 27 | 9 | 37 | 36 |
| `diagram.group.ungroup:core` | (any) | 28 | 27 | 8 | 36 | 35 |
| `diagram.group.chart.make:core` | group.labels group.values group.layout | 30 | 30 | 15 | 45 | 45 |
| `diagram.group.chart.make:title` | group.label | 55 | 55 | 8 | 63 | 63 |
| `diagram.group.chart.adopt:core` | group.id | 25 | 0 | 22 | 47 | 22 |
| `diagram.group.chart:core` | chart.type | 0 | 0 | 29 | 29 | 29 |
| `diagram.group.chart:title` | chart.title | 936 | 936 | 8 | 944 | 944 |

### Operation x parameter (requests carrying the parameter)

| operation | parameter | required | reader keys | before | new | after |
| --- | --- | :---: | --- | ---: | ---: | ---: |
| `diagram.node.make` | kind | yes | @kind | 4,346 | 63 | 4,409 |
| `diagram.node.make` | label |  | node.label | 3,988 | 13 | 4,001 |
| `diagram.node.make` | n |  | node.n | 160 | 15 | 175 |
| `diagram.node.make` | colour |  | node.colour | 2,081 | 15 | 2,096 |
| `diagram.node.make` | size |  | node.size | 147 | 14 | 161 |
| `diagram.node.make` | layout |  | node.layout | 81 | 9 | 90 |
| `diagram.node.make` | x |  | node.x | 135 | 8 | 143 |
| `diagram.node.make` | y |  | node.y | 129 | 8 | 137 |
| `diagram.node.change` | ids | yes | @ref | 2,208 | 82 | 2,290 |
| `diagram.node.change` | colour |  | node.colour | 2,044 | 14 | 2,058 |
| `diagram.node.change` | size |  | node.size | 156 | 35 | 191 |
| `diagram.node.change` | label |  | node.label | 38 | 25 | 63 |
| `diagram.node.change` | value |  | node.value | 50 | 8 | 58 |
| `diagram.node.select` | ids | yes | @ref | 84 | 31 | 115 |
| `diagram.node.select` | edges |  | node.edges | 16 | 22 | 38 |
| `diagram.node.remove` | ids | yes | @ref | 29 | 44 | 73 |
| `diagram.node.place` | ids | yes | @ref | 121 | 46 | 167 |
| `diagram.node.place` | x | yes | node.x | 58 | 19 | 77 |
| `diagram.node.place` | y | yes | node.y | 58 | 19 | 77 |
| `diagram.node.resize` | ids | yes | @ref | 181 | 22 | 203 |
| `diagram.node.resize` | width | yes | node.width | 120 | 19 | 139 |
| `diagram.node.resize` | height | yes | node.height | 118 | 18 | 136 |
| `diagram.node.layout` | ids | yes | @ref | 51 | 9 | 60 |
| `diagram.node.layout` | layout | yes | node.layout | 51 | 9 | 60 |
| `diagram.link.make` | from | yes | link.from | 2,402 | 10 | 2,412 |
| `diagram.link.make` | to | yes | link.to | 2,402 | 32 | 2,434 |
| `diagram.link.select` | ids | yes | @ref | 57 | 0 | 57 |
| `diagram.link.select` | nodes |  | link.nodes | 0 | 0 | 0 |
| `diagram.link.change` | ids | yes | @ref | 220 | 79 | 299 |
| `diagram.link.change` | from |  | link.from | 103 | 52 | 155 |
| `diagram.link.change` | to |  | link.to | 103 | 59 | 162 |
| `diagram.link.change` | label |  | link.label | 103 | 9 | 112 |
| `diagram.link.change` | colour |  | link.colour | 113 | 8 | 121 |
| `diagram.link.change` | style |  | link.style | 95 | 9 | 104 |
| `diagram.link.change` | arrow |  | link.arrow | 103 | 8 | 111 |
| `diagram.link.change` | width |  | link.width | 98 | 8 | 106 |
| `diagram.link.remove` | ids | yes | @ref | 51 | 1 | 52 |
| `diagram.selection.remove` | nodes | yes | sketch.nodes | 50 | 0 | 50 |
| `diagram.selection.remove` | links | yes | sketch.links | 27 | 0 | 27 |
| `diagram.page.clear` | (none) | | | | | |
| `diagram.ids.show` | mode | yes | page.mode | 0 | 66 | 66 |
| `diagram.ids.show` | duration |  | page.duration | 20 | 8 | 28 |
| `diagram.observe` | (none) | | | | | |
| `diagram.undo` | (none) | | | | | |
| `diagram.redo` | (none) | | | | | |
| `diagram.group.make` | name | yes | group.name | 30 | 23 | 53 |
| `diagram.group.make` | label |  | group.label | 21 | 22 | 43 |
| `diagram.group.make` | ids | yes | group.ids | 30 | 64 | 94 |
| `diagram.group.select` | id | yes | @ref | 28 | 22 | 50 |
| `diagram.group.change` | id | yes | @ref | 69 | 28 | 97 |
| `diagram.group.change` | label |  | group.label | 52 | 8 | 60 |
| `diagram.group.change` | colour |  | group.colour | 51 | 11 | 62 |
| `diagram.group.change` | size |  | group.size | 51 | 9 | 60 |
| `diagram.group.layout` | id | yes | @ref | 64 | 8 | 72 |
| `diagram.group.layout` | layout | yes | group.layout | 60 | 8 | 68 |
| `diagram.group.resize` | id | yes | @ref | 60 | 45 | 105 |
| `diagram.group.resize` | scale | yes | group.scale | 36 | 45 | 81 |
| `diagram.group.place` | id | yes | @ref | 36 | 10 | 46 |
| `diagram.group.place` | x | yes | group.x | 36 | 8 | 44 |
| `diagram.group.place` | y | yes | group.y | 36 | 8 | 44 |
| `diagram.group.remove` | id | yes | @ref | 28 | 9 | 37 |
| `diagram.group.ungroup` | id | yes | @ref | 28 | 8 | 36 |
| `diagram.group.chart.make` | label | yes | group.label | 55 | 8 | 63 |
| `diagram.group.chart.make` | labels | yes | group.labels | 55 | 16 | 71 |
| `diagram.group.chart.make` | values | yes | group.values | 55 | 16 | 71 |
| `diagram.group.chart.make` | layout | yes | group.layout | 30 | 14 | 44 |
| `diagram.group.chart.adopt` | id | yes | group.id | 25 | 22 | 47 |
| `diagram.group.chart` | id | yes | chart.source | 0 | 29 | 29 |
| `diagram.group.chart` | type | yes | chart.type | 0 | 27 | 27 |
| `diagram.group.chart` | title |  | chart.title | 936 | 8 | 944 |

## calendar (time.calendar)

### Cases

| case | keys | before | before, human-named | new | after | after, human-named |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `calendar.calendar.add:core` | calendar.name | 903 | 903 | 27 | 930 | 930 |
| `calendar.calendar.add:colour` | calendar.colour | 0 | 0 | 22 | 22 | 22 |
| `calendar.calendar.change:rename` | calendar.name | 1 | 1 | 24 | 25 | 25 |
| `calendar.calendar.change:colour` | calendar.colour | 1 | 1 | 23 | 24 | 24 |
| `calendar.calendar.remove:core` | (any) | 0 | 0 | 22 | 22 | 22 |
| `calendar.person.add:core` | person.name | 0 | 0 | 22 | 22 | 22 |
| `calendar.person.change:rename` | person.name | 0 | 0 | 23 | 23 | 23 |
| `calendar.person.remove:core` | (any) | 0 | 0 | 22 | 22 | 22 |
| `calendar.room.add:core` | room.name | 101 | 101 | 33 | 134 | 134 |
| `calendar.room.add:capacity` | room.seats | 101 | 101 | 9 | 110 | 110 |
| `calendar.room.add:location` | room.location | 1 | 1 | 22 | 23 | 23 |
| `calendar.room.change:rename` | room.name | 0 | 0 | 23 | 23 | 23 |
| `calendar.room.change:capacity` | room.seats | 1 | 1 | 23 | 24 | 24 |
| `calendar.room.change:location` | room.location | 1 | 1 | 22 | 23 | 23 |
| `calendar.room.remove:core` | (any) | 0 | 0 | 22 | 22 | 22 |
| `calendar.meeting.add:people` | meeting.people | 7 | 7 | 73 | 80 | 80 |
| `calendar.meeting.add:start` | meeting.day meeting.time | 2,006 | 2,006 | 44 | 2,050 | 2,050 |
| `calendar.meeting.add:duration` | meeting.length | 2,002 | 2,002 | 10 | 2,012 | 2,012 |
| `calendar.meeting.add:room` | meeting.room | 942 | 942 | 8 | 950 | 950 |
| `calendar.meeting.add:calendar` | meeting.calendar | 1,064 | 1,064 | 8 | 1,072 | 1,072 |
| `calendar.meeting.add:notes` | meeting.notes | 0 | 0 | 22 | 22 | 22 |
| `calendar.meeting.add:free-slot` | meeting.free | 0 | 0 | 22 | 22 | 22 |
| `calendar.event.add:core` | meeting.title meeting.time | 72 | 72 | 21 | 93 | 93 |
| `calendar.event.add:duration` | meeting.title meeting.length | 47 | 47 | 10 | 57 | 57 |
| `calendar.event.select:core` | (any) | 29 | 29 | 8 | 37 | 37 |
| `calendar.meeting.change:rename` | meeting.title | 102 | 102 | 9 | 111 | 111 |
| `calendar.meeting.change:duration` | meeting.length | 93 | 93 | 8 | 101 | 101 |
| `calendar.meeting.change:people` | meeting.people | 2 | 2 | 26 | 28 | 28 |
| `calendar.meeting.change:room` | meeting.room | 5 | 5 | 30 | 35 | 35 |
| `calendar.meeting.change:calendar` | meeting.calendar | 0 | 0 | 23 | 23 | 23 |
| `calendar.meeting.change:notes` | meeting.notes | 48 | 48 | 8 | 56 | 56 |
| `calendar.meeting.move:time` | meeting.time | 641 | 641 | 10 | 651 | 651 |
| `calendar.meeting.move:day` | meeting.day | 637 | 637 | 11 | 648 | 648 |
| `calendar.meeting.move:shift` | meeting.shift | 0 | 0 | 23 | 23 | 23 |
| `calendar.events.remove:core` | #sel2 | 0 | 0 | 22 | 22 | 22 |
| `calendar.meeting.remove:core` | (any) | 41 | 41 | 9 | 50 | 50 |
| `calendar.meeting.remove:selected` | @ctx | 0 | 0 | 22 | 22 | 22 |
| `calendar.observe:describe` | ?describe | 29 | 29 | 8 | 37 | 37 |
| `calendar.observe:when` | ?when | 0 | 0 | 22 | 22 | 22 |
| `calendar.observe:exists` | ?exists | 10 | 10 | 22 | 32 | 32 |

### Operation x parameter (requests carrying the parameter)

| operation | parameter | required | reader keys | before | new | after |
| --- | --- | :---: | --- | ---: | ---: | ---: |
| `calendar.calendar.add` | id | yes | (excluded, see cases.py) | | | |
| `calendar.calendar.add` | label | yes | calendar.name | 903 | 26 | 929 |
| `calendar.calendar.add` | colour |  | calendar.colour | 0 | 22 | 22 |
| `calendar.calendar.change` | id | yes | @ref | 2 | 47 | 49 |
| `calendar.calendar.change` | label |  | calendar.name | 1 | 24 | 25 |
| `calendar.calendar.change` | colour |  | calendar.colour | 1 | 23 | 24 |
| `calendar.calendar.remove` | id | yes | @ref | 0 | 22 | 22 |
| `calendar.person.add` | id | yes | (excluded, see cases.py) | | | |
| `calendar.person.add` | label | yes | person.name | 0 | 21 | 21 |
| `calendar.person.change` | id | yes | @ref | 0 | 23 | 23 |
| `calendar.person.change` | label |  | person.name | 0 | 23 | 23 |
| `calendar.person.remove` | id | yes | @ref | 0 | 22 | 22 |
| `calendar.room.add` | id | yes | (excluded, see cases.py) | | | |
| `calendar.room.add` | label | yes | room.name | 101 | 32 | 133 |
| `calendar.room.add` | capacity |  | room.seats | 101 | 9 | 110 |
| `calendar.room.add` | location |  | room.location | 1 | 22 | 23 |
| `calendar.room.change` | id | yes | @ref | 2 | 68 | 70 |
| `calendar.room.change` | label |  | room.name | 0 | 23 | 23 |
| `calendar.room.change` | capacity |  | room.seats | 1 | 23 | 24 |
| `calendar.room.change` | location |  | room.location | 1 | 22 | 23 |
| `calendar.room.remove` | id | yes | @ref | 0 | 22 | 22 |
| `calendar.meeting.add` | id | yes | (excluded, see cases.py) | | | |
| `calendar.meeting.add` | title | yes | meeting.title | 2,005 | 9 | 2,014 |
| `calendar.meeting.add` | start | yes | meeting.day meeting.time | 2,006 | 55 | 2,061 |
| `calendar.meeting.add` | duration | yes | meeting.length | 2,002 | 8 | 2,010 |
| `calendar.meeting.add` | participants | yes | meeting.people | 7 | 73 | 80 |
| `calendar.meeting.add` | room | yes | meeting.room | 942 | 8 | 950 |
| `calendar.meeting.add` | calendar |  | meeting.calendar | 1,064 | 8 | 1,072 |
| `calendar.meeting.add` | notes |  | meeting.notes | 0 | 14 | 14 |
| `calendar.event.add` | id | yes | (excluded, see cases.py) | | | |
| `calendar.event.add` | title | yes | meeting.title | 77 | 28 | 105 |
| `calendar.event.add` | start | yes | meeting.day meeting.time | 76 | 26 | 102 |
| `calendar.event.add` | duration | yes | meeting.length | 47 | 10 | 57 |
| `calendar.event.add` | notes |  | meeting.notes | 40 | 8 | 48 |
| `calendar.event.select` | id | yes | @ref | 29 | 8 | 37 |
| `calendar.meeting.change` | id | yes | @ref | 290 | 104 | 394 |
| `calendar.meeting.change` | title |  | meeting.title | 102 | 9 | 111 |
| `calendar.meeting.change` | start |  | meeting.day meeting.time | 74 | 0 | 74 |
| `calendar.meeting.change` | duration |  | meeting.length | 93 | 8 | 101 |
| `calendar.meeting.change` | participants |  | meeting.people | 3 | 26 | 29 |
| `calendar.meeting.change` | room |  | meeting.room | 5 | 30 | 35 |
| `calendar.meeting.change` | calendar |  | meeting.calendar | 0 | 23 | 23 |
| `calendar.meeting.change` | notes |  | meeting.notes | 48 | 8 | 56 |
| `calendar.meeting.move` | id | yes | @ref | 645 | 44 | 689 |
| `calendar.meeting.move` | start | yes | meeting.day meeting.time | 644 | 21 | 665 |
| `calendar.events.remove` | ids | yes | @ref | 28 | 44 | 72 |
| `calendar.meeting.remove` | id | yes | @ref | 41 | 9 | 50 |
| `calendar.observe` | (none) | | | | | |

## document (docs.editor)

### Cases

| case | keys | before | before, human-named | new | after | after, human-named |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `document.title.change:core` | document.title | 59 | 59 | 8 | 67 | 67 |
| `document.block.select:words` | block.text@selector | 0 | 0 | 23 | 23 | 23 |
| `document.block.select:characters` | block.from block.to | 24 | 24 | 8 | 32 | 32 |
| `document.section.select:words` | section.text@selector | 0 | 0 | 22 | 22 | 22 |
| `document.section.select:whole` | (any) | 50 | 25 | 30 | 80 | 55 |
| `document.section.change:text` | section.text | 94 | 72 | 8 | 102 | 80 |
| `document.section.change:level` | section.level | 60 | 37 | 8 | 68 | 45 |
| `document.section.change:name` | section.name | 31 | 31 | 8 | 39 | 39 |
| `document.block.mark:mark` | block.mark | 93 | 69 | 55 | 148 | 124 |
| `document.block.mark:mark-off` | block.mark@negative | 0 | 0 | 24 | 24 | 24 |
| `document.block.mark:link` | block.mark=link block.attrs | 0 | 0 | 22 | 22 | 22 |
| `document.section.mark:mark` | section.mark | 28 | 28 | 32 | 60 | 60 |
| `document.section.mark:mark-off` | section.mark@negative | 0 | 0 | 22 | 22 | 22 |
| `document.block.align:align` | block.align | 72 | 48 | 9 | 81 | 57 |
| `document.section.align:align` | section.align | 28 | 27 | 8 | 36 | 35 |
| `document.block.reorder:core` | (any) | 51 | 24 | 8 | 59 | 32 |
| `document.list.make:core` | block.items block.style | 90 | 90 | 10 | 100 | 100 |
| `document.list.make:name` | block.name | 23 | 23 | 21 | 44 | 44 |
| `document.list.change:items` | block.items | 69 | 69 | 8 | 77 | 77 |
| `document.list.change:style` | block.style | 67 | 67 | 8 | 75 | 75 |
| `document.list.change:checked` | block.checked | 45 | 45 | 8 | 53 | 53 |
| `document.table.make:core` | block.rows | 62 | 62 | 16 | 78 | 78 |
| `document.table.make:header` | block.header | 25 | 25 | 8 | 33 | 33 |
| `document.table.make:name` | block.name | 26 | 26 | 8 | 34 | 34 |
| `document.table.change:rows` | block.rows | 50 | 28 | 8 | 58 | 36 |
| `document.table.change:header` | block.header | 45 | 25 | 8 | 53 | 33 |
| `document.container.change:core` | block.text | 28 | 28 | 8 | 36 | 36 |
| `document.write:core` | text.title | 978 | 978 | 11 | 989 | 989 |
| `document.write:content` | text.content | 949 | 949 | 8 | 957 | 957 |
| `document.compose:core` | text.genre text.about | 0 | 0 | 52 | 52 | 52 |
| `document.compose:words` | text.words | 1,025 | 1,025 | 11 | 1,036 | 1,036 |
| `document.compose:chapters` | text.chapters | 1 | 1 | 24 | 25 | 25 |
| `document.rewrite:tone` | text.tone | 0 | 0 | 28 | 28 | 28 |
| `document.rewrite:length` | text.length | 0 | 0 | 23 | 23 | 23 |
| `document.block.make:kind` | @kind | 319 | 319 | 25 | 344 | 344 |
| `document.block.make:text` | block.text | 306 | 306 | 15 | 321 | 321 |
| `document.block.make:level` | block.level | 23 | 23 | 8 | 31 | 31 |
| `document.block.make:name` | block.name | 43 | 43 | 8 | 51 | 51 |
| `document.section.make:kind` | @kind | 1,260 | 1,260 | 47 | 1,307 | 1,307 |
| `document.section.make:text` | section.text | 1,333 | 1,333 | 24 | 1,357 | 1,357 |
| `document.section.make:after` | section.order | 0 | 0 | 24 | 24 | 24 |
| `document.section.make:name` | section.name | 47 | 47 | 8 | 55 | 55 |
| `document.block.change:text` | block.text | 2,486 | 2,465 | 8 | 2,494 | 2,473 |
| `document.block.change:name` | block.name | 67 | 48 | 8 | 75 | 56 |
| `document.block.change:kind` | block.kind | 0 | 0 | 22 | 22 | 22 |
| `document.block.change:level` | block.level | 27 | 27 | 8 | 35 | 35 |
| `document.block.remove:core` | (any) | 51 | 27 | 38 | 89 | 65 |
| `document.block.remove:selected` | @ctx | 27 | 27 | 8 | 35 | 35 |
| `document.block.remove:all` | @all | 0 | 0 | 22 | 22 | 22 |
| `document.section.remove:core` | (any) | 247 | 247 | 8 | 255 | 255 |
| `document.section.reorder:order` | section.order | 437 | 437 | 8 | 445 | 445 |
| `document.remove:core` | (any) | 27 | 27 | 8 | 35 | 35 |
| `document.observe:describe` | ?describe | 27 | 27 | 8 | 35 | 35 |
| `document.observe:count` | ?count | 0 | 0 | 22 | 22 | 22 |
| `document.undo:core` | (any) | 26 | 26 | 8 | 34 | 34 |
| `document.redo:core` | (any) | 25 | 25 | 8 | 33 | 33 |

### Operation x parameter (requests carrying the parameter)

| operation | parameter | required | reader keys | before | new | after |
| --- | --- | :---: | --- | ---: | ---: | ---: |
| `document.title.change` | id | yes | (excluded, see cases.py) | | | |
| `document.title.change` | title | yes | document.title | 59 | 8 | 67 |
| `document.block.select` | id | yes | @ref | 74 | 31 | 105 |
| `document.block.select` | at |  | (excluded, see cases.py) | | | |
| `document.block.select` | from | yes | block.from | 24 | 7 | 31 |
| `document.block.select` | to | yes | block.to | 48 | 8 | 56 |
| `document.section.select` | id | yes | @ref | 50 | 30 | 80 |
| `document.section.select` | at |  | (excluded, see cases.py) | | | |
| `document.section.select` | from | yes | section.from | 0 | 0 | 0 |
| `document.section.select` | to | yes | section.to | 25 | 0 | 25 |
| `document.section.change` | id | yes | @ref | 146 | 32 | 178 |
| `document.section.change` | text |  | section.text | 94 | 8 | 102 |
| `document.section.change` | name |  | section.name | 31 | 8 | 39 |
| `document.section.change` | kind |  | (excluded, see cases.py) | | | |
| `document.section.change` | level |  | section.level | 60 | 8 | 68 |
| `document.section.change` | align |  | section.align | 32 | 8 | 40 |
| `document.block.mark` | id | yes | @ref | 96 | 72 | 168 |
| `document.block.mark` | at |  | (excluded, see cases.py) | | | |
| `document.block.mark` | from | yes | block.text@selector | 0 | 32 | 32 |
| `document.block.mark` | to | yes | block.text@selector | 0 | 32 | 32 |
| `document.block.mark` | mark | yes | block.mark | 93 | 56 | 149 |
| `document.block.mark` | enabled | yes | block.mark@negative | 0 | 24 | 24 |
| `document.block.mark` | attrs |  | block.attrs | 0 | 21 | 21 |
| `document.section.mark` | id | yes | @ref | 28 | 32 | 60 |
| `document.section.mark` | at |  | (excluded, see cases.py) | | | |
| `document.section.mark` | from | yes | section.text@selector | 0 | 6 | 6 |
| `document.section.mark` | to | yes | section.text@selector | 0 | 6 | 6 |
| `document.section.mark` | mark | yes | section.mark | 28 | 32 | 60 |
| `document.section.mark` | enabled | yes | section.mark@negative | 0 | 22 | 22 |
| `document.section.mark` | attrs |  | (excluded, see cases.py) | | | |
| `document.block.align` | id | yes | @ref | 76 | 9 | 85 |
| `document.block.align` | align | yes | block.align | 72 | 9 | 81 |
| `document.section.align` | id | yes | @ref | 28 | 0 | 28 |
| `document.section.align` | align | yes | section.align | 28 | 0 | 28 |
| `document.block.reorder` | ids | yes | @ref | 51 | 8 | 59 |
| `document.list.make` | parent | yes | (excluded, see cases.py) | | | |
| `document.list.make` | name |  | block.name | 23 | 21 | 44 |
| `document.list.make` | items | yes | block.items | 90 | 10 | 100 |
| `document.list.make` | style | yes | block.style | 90 | 11 | 101 |
| `document.list.change` | id | yes | @ref | 80 | 24 | 104 |
| `document.list.change` | items |  | block.items | 69 | 8 | 77 |
| `document.list.change` | style |  | block.style | 67 | 8 | 75 |
| `document.list.change` | checked |  | block.checked | 45 | 8 | 53 |
| `document.table.make` | parent | yes | (excluded, see cases.py) | | | |
| `document.table.make` | name |  | block.name | 26 | 2 | 28 |
| `document.table.make` | rows | yes | block.rows | 62 | 15 | 77 |
| `document.table.make` | header |  | block.header | 25 | 8 | 33 |
| `document.table.change` | id | yes | @ref | 54 | 16 | 70 |
| `document.table.change` | rows |  | block.rows | 50 | 8 | 58 |
| `document.table.change` | header |  | block.header | 45 | 8 | 53 |
| `document.container.change` | id | yes | @ref | 28 | 0 | 28 |
| `document.container.change` | text | yes | block.text | 28 | 0 | 28 |
| `document.write` | title | yes | text.title | 978 | 10 | 988 |
| `document.write` | blocks | yes | text.content | 949 | 8 | 957 |
| `document.write` | genre |  | text.genre | 0 | 28 | 28 |
| `document.write` | topic |  | text.about | 0 | 28 | 28 |
| `document.compose` | genre | yes | text.genre | 0 | 27 | 27 |
| `document.compose` | topic | yes | text.about | 1,026 | 29 | 1,055 |
| `document.compose` | words |  | text.words | 1,025 | 11 | 1,036 |
| `document.compose` | chapters |  | text.chapters | 1 | 24 | 25 |
| `document.rewrite` | property | yes | text.tone text.length | 0 | 51 | 51 |
| `document.rewrite` | value | yes | text.tone text.length | 0 | 51 | 51 |
| `document.block.make` | parent | yes | (excluded, see cases.py) | | | |
| `document.block.make` | kind | yes | @kind | 319 | 17 | 336 |
| `document.block.make` | text |  | block.text | 306 | 15 | 321 |
| `document.block.make` | level |  | block.level | 23 | 8 | 31 |
| `document.block.make` | name |  | block.name | 43 | 1 | 44 |
| `document.section.make` | parent | yes | (excluded, see cases.py) | | | |
| `document.section.make` | after |  | section.order | 0 | 24 | 24 |
| `document.section.make` | text |  | section.text | 2,711 | 24 | 2,735 |
| `document.section.make` | level |  | section.level @kind | 2,669 | 47 | 2,716 |
| `document.section.make` | name |  | section.name | 47 | 8 | 55 |
| `document.block.change` | id | yes | @ref | 2,507 | 38 | 2,545 |
| `document.block.change` | text |  | block.text | 2,486 | 0 | 2,486 |
| `document.block.change` | name |  | block.name | 67 | 8 | 75 |
| `document.block.change` | kind |  | block.kind | 0 | 22 | 22 |
| `document.block.change` | level |  | block.level | 27 | 8 | 35 |
| `document.block.change` | align |  | block.align | 68 | 0 | 68 |
| `document.block.remove` | ids | yes | @ref | 51 | 38 | 89 |
| `document.section.remove` | ids | yes | @ref | 247 | 8 | 255 |
| `document.section.reorder` | ids | yes | @ref | 490 | 8 | 498 |
| `document.remove` | (none) | | | | | |
| `document.observe` | (none) | | | | | |
| `document.undo` | (none) | | | | | |
| `document.redo` | (none) | | | | | |

## avatar (ui.avatar)

### Cases

| case | keys | before | before, human-named | new | after | after, human-named |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `avatar.face.compose:base` | face.base | 74 | 74 | 18 | 92 | 92 |
| `avatar.face.compose:kind` | face.characterKind | 43 | 43 | 12 | 55 | 55 |
| `avatar.face.preset:preset` | face.preset | 227 | 227 | 20 | 247 | 247 |
| `avatar.face.expression:expression` | face.expression | 102 | 102 | 19 | 121 | 121 |
| `avatar.face.name:core` | face.name | 36 | 36 | 11 | 47 | 47 |
| `avatar.face.select:core` | (any) | 28 | 28 | 8 | 36 | 36 |
| `avatar.ids.show:temporary` | face.mode=temporary | 0 | 0 | 24 | 24 | 24 |
| `avatar.ids.show:duration` | face.duration | 20 | 20 | 9 | 29 | 29 |
| `avatar.ids.show:always` | face.mode=always | 0 | 0 | 23 | 23 | 23 |
| `avatar.ids.show:off` | face.mode=off | 0 | 0 | 23 | 23 | 23 |
| `avatar.part.select:core` | (any) | 51 | 51 | 12 | 63 | 63 |
| `avatar.face.resize:scale-number` | face.scale@eq | 26 | 26 | 9 | 35 | 35 |
| `avatar.face.resize:scale-relative` | face.scale@delta | 1 | 1 | 23 | 24 | 24 |
| `avatar.part.resize:scale-number` | part.scale@eq | 26 | 26 | 9 | 35 | 35 |
| `avatar.part.resize:scale-relative` | part.scale@delta | 1 | 1 | 22 | 23 | 23 |
| `avatar.part.add:variant` | part.variant | 345 | 345 | 24 | 369 | 369 |
| `avatar.part.add:slot` | part.id part.variant | 199 | 199 | 11 | 210 | 210 |
| `avatar.part.change:variant` | part.variant | 372 | 372 | 12 | 384 | 384 |
| `avatar.part.change:colour` | part.colour | 91 | 91 | 25 | 116 | 116 |
| `avatar.part.change:size` | part.size | 259 | 259 | 14 | 273 | 273 |
| `avatar.part.feature:core` | part.value | 51 | 51 | 13 | 64 | 64 |
| `avatar.part.move:place` | part.place | 143 | 143 | 11 | 154 | 154 |
| `avatar.part.remove:core` | (any) | 31 | 31 | 42 | 73 | 73 |
| `avatar.parts.remove:core` | #sel2 | 28 | 28 | 10 | 38 | 38 |
| `avatar.clear:core` | @all | 0 | 0 | 23 | 23 | 23 |
| `avatar.observe:describe` | ?describe | 28 | 28 | 9 | 37 | 37 |
| `avatar.observe:exists` | ?exists | 0 | 0 | 23 | 23 | 23 |
| `avatar.undo:core` | (any) | 24 | 24 | 9 | 33 | 33 |
| `avatar.redo:core` | (any) | 25 | 25 | 8 | 33 | 33 |

### Operation x parameter (requests carrying the parameter)

| operation | parameter | required | reader keys | before | new | after |
| --- | --- | :---: | --- | ---: | ---: | ---: |
| `avatar.face.compose` | id |  | (excluded, see cases.py) | | | |
| `avatar.face.compose` | characterKind |  | face.characterKind | 43 | 12 | 55 |
| `avatar.face.compose` | base |  | face.base | 74 | 18 | 92 |
| `avatar.face.preset` | id |  | (excluded, see cases.py) | | | |
| `avatar.face.preset` | preset | yes | face.preset | 227 | 20 | 247 |
| `avatar.face.expression` | id |  | (excluded, see cases.py) | | | |
| `avatar.face.expression` | expression | yes | face.expression | 102 | 19 | 121 |
| `avatar.face.name` | id |  | (excluded, see cases.py) | | | |
| `avatar.face.name` | name | yes | face.name | 36 | 11 | 47 |
| `avatar.face.select` | id |  | (excluded, see cases.py) | | | |
| `avatar.ids.show` | mode | yes | face.mode | 0 | 67 | 67 |
| `avatar.ids.show` | duration |  | face.duration | 20 | 9 | 29 |
| `avatar.part.select` | id | yes | @ref | 51 | 12 | 63 |
| `avatar.face.resize` | id |  | (excluded, see cases.py) | | | |
| `avatar.face.resize` | scale | yes | face.scale | 27 | 32 | 59 |
| `avatar.part.resize` | ids | yes | @ref | 53 | 31 | 84 |
| `avatar.part.resize` | scale | yes | part.scale | 27 | 31 | 58 |
| `avatar.part.add` | id | yes | part.id | 199 | 13 | 212 |
| `avatar.part.add` | variant | yes | part.variant | 345 | 22 | 367 |
| `avatar.part.change` | ids | yes | @ref | 261 | 51 | 312 |
| `avatar.part.change` | variant |  | part.variant | 372 | 12 | 384 |
| `avatar.part.change` | colour |  | part.colour | 91 | 25 | 116 |
| `avatar.part.change` | size |  | part.size | 259 | 14 | 273 |
| `avatar.part.feature` | id | yes | @ref | 51 | 13 | 64 |
| `avatar.part.feature` | property | yes | part.property | 26 | 5 | 31 |
| `avatar.part.feature` | value | yes | part.value | 51 | 13 | 64 |
| `avatar.part.move` | ids | yes | @ref | 55 | 11 | 66 |
| `avatar.part.move` | place | yes | part.place | 143 | 11 | 154 |
| `avatar.part.remove` | ids | yes | @ref | 28 | 38 | 66 |
| `avatar.parts.remove` | ids | yes | @ref | 28 | 0 | 28 |
| `avatar.clear` | ids | yes | @all | 0 | 0 | 0 |
| `avatar.observe` | (none) | | | | | |
| `avatar.undo` | (none) | | | | | |
| `avatar.redo` | (none) | | | | | |

## Enum spread in the new rows

Values of closed-enum parameters in this corpus (result values; target kinds).

| operation | key | values |
| --- | --- | --- |
| `avatar.face.compose` | face.base | queen 2, man 2, woman 2, old man 1, bearded man 1, woman with curly hair 1, alien 1, clown 1, old woman 1, boy 1, robot 1, girl 1, child 1, baby 1 |
| `avatar.face.compose` | face.characterKind | human 4, robot 4, alien 4 |
| `avatar.face.expression` | face.expression | happy 4, surprised 3, angry 3, sleepy 3, sad 2, talking 2, wink 2 |
| `avatar.face.name` | face.name | Mira 1, Captain Zog 1, Granny Rose 1, Tomasz 1, Pip 1, Doctor Ada 1, Sparky 1, Bolt 1, Luna 1, Mr Whiskers 1, Maud 1 |
| `avatar.face.preset` | face.preset | robot 3, clown 2, bearded man 2, queen 2, old woman 1, girl 1, woman with curly hair 1, alien 1, baby 1, old man 1, child 1, boy 1, man 1, woman 1 |
| `avatar.face.resize` | face.scale | 10 4, 20 3, 15 2, 1.3 1, 0.8 1, 1.5 1, 0.7 1, 0.9 1, 1.4 1, 1.2 1, 0.6 1, 1.1 1, 25 1, 8 1, 30 1, 5 1, 12 1 |
| `avatar.ids.show` | face.duration | 10 1, 5 1, 3 1, 20 1, 8 1, 15 1, 6 1, 30 1 |
| `avatar.ids.show` | face.mode | off 23, temporary 22, always 22 |
| `avatar.part.add` | part.id | earrings 3, hat 2, hair_back 2, moustache 2, cheeks 1, glasses 1, beard 1, shoulders 1 |
| `avatar.part.add` | part.variant | freckles 2, crown 2, hoop 2, top hat 1, sunglasses 1, goatee 1, beanie 1, monocle 1, handlebar 1, blush 1, bun 1, pencil 1, cat-eye 1, chef hat 1, stubble 1, pigtails 1, pearl 1, walrus 1, lab coat 1 |
| `avatar.part.change` | part.colour | grey 2, blond 2, yellow 2, purple 1, hazel 1, dark brown 1, red 1, auburn 1, white 1, metal grey 1, olive 1, brown 1, pink 1, blue 1, orange 1, green 1, black 1, tan 1, amber 1, pale 1, light 1 |
| `avatar.part.change` | part.size | big 4, small 4, tiny 2, huge 2, default 2 |
| `avatar.part.change` | part.variant | sunglasses 1, beanie 1, walrus 1, goatee 1, stud 1, knight helmet 1, lab coat 1, bun 1, spikes 1, hoodie 1, beret 1 |
| `avatar.part.feature` | part.property | length 1, feel 1, shape 1, kind 1, age 1 |
| `avatar.part.feature` | part.value | bushy 2, curly 1, long 1, smiling 1, pointed 1, hoodie 1, old 1, thick 1, wavy 1, round 1, full lips 1, wide 1 |
| `avatar.part.move` | part.place | up 4, down 3, left 2, right 2 |
| `avatar.part.resize` | part.scale | 10 4, 15 2, 20 2, 25 2, 0.8 1, 1.2 1, 1.3 1, 1.4 1, 0.9 1, 0.7 1, 1.1 1, 1.25 1, 0.6 1, 30 1, 5 1, 12 1, 8 1 |
| `calendar.calendar.add` | calendar.colour | teal 1, orange 1, purple 1, navy 1, pink 1, lime green 1, grey 1, red 1, yellow 1, turquoise 1, dark green 1, brown 1, bright magenta 1, gold 1, lavender 1, coral 1, sky blue 1, olive 1, mint 1 |
| `calendar.calendar.add` | calendar.name | Book club 2, Side project 1, Kids school 1, Volunteering 1, Travel 1, Freelance 1, running 1, Holidays 1, Choir 1, Side gigs 1, Birthdays 1, Garden 1, Study 1, Doctor visits 1, Kids 1, Classes 1, Football 1, Moving 1, Chores 1, Team lunches 1, yoga retreats 1, Podcast 1, Reading 1, Bills 1, Concerts 1 |
| `calendar.calendar.change` | calendar.colour | green 2, dark blue 1, orange 1, purple 1, pink 1, red 1, teal 1, yellow 1, amber 1, bright orange 1, grey 1, black 1, violet 1, calm navy 1, lime 1, brown 1, gold 1, silver 1, maroon 1 |
| `calendar.calendar.change` | calendar.name | Fitness 2, Office 2, Home 1, Family and friends 1, Day job 1, Training 1, Reading group 1, Acme 1, Northwind 1, Move 1, Household 1, School and clubs 1, Agency work 1, Our home 1, Workouts 1, Personal 1, Errands 1, Studio 1, Clan 1, Hobbies 1, Pilates 1 |
| `calendar.event.add` | @kind | meeting 9, event 7, call 2, reminder 1, team meeting 1 |
| `calendar.event.add` | meeting.day | Friday 3, Monday 3, Thursday 3, Dec 3 2, Tuesday 2, Wednesday 2, tomorrow 2, Saturday 2, next Friday 1, for the 24th 1, next Monday 1, today 1, Sunday 1 |
| `calendar.event.add` | meeting.length | 90 2, 3 1, 45 1, 40 1, 2 1, 50 1, 20 1, 1 1 |
| `calendar.event.add` | meeting.notes | Review the three shortlisted CVs 1, ask about delivery dates 1, Dial-in code 4471 1, Priya brings the slides 1, print 10 copies of the deck 1, what went wrong with the release 1, parking is on level 2 1 |
| `calendar.event.add` | meeting.time | 10am 2, 8:30 2, 10 2, 4pm 2, 11am 2, 15:00 1, half past nine 1, 2 1, morning 1, 11 1, 3:15 1, 5pm 1, 8 in the morning 1, 7pm 1, 6 1, afternoon 1, 9 1, 6pm 1 |
| `calendar.event.add` | meeting.title | Packing 1, Q1 planning 1, Vendor call 1, Kickoff 1, Ops review 1, Strategy 1, Planning offsite 1, Hiring sync 1, Supplier 1, Onboarding 1, Board prep 1, Retro 1, Haircut 1, Pick up the kids 1, Piano lesson 1, Car service 1, Call Mum 1, dentist appointment 1, Swimming 1, Pharmacy pickup 1, Morning run 1, Deep work 1, Physio 1, Exam prep 1, Nails 1 |
| `calendar.meeting.add` | @kind | meeting 34, call 11, chat 3, sync 3, catch-up 2, check-in 2, 1:1 1, planning session 1, lunch meeting 1, workshop 1, design review 1, interview 1, review 1, session 1, family meeting 1, lunch 1, celebration 1 |
| `calendar.meeting.add` | meeting.calendar | Work 3, Family 2, Gym 2, family 1 |
| `calendar.meeting.add` | meeting.day | tomorrow 13, Friday 9, Thursday 8, Monday 7, Wednesday 6, next Tuesday 2, next Monday 2, Tuesday 2, Dec 3 1, on the 24th 1, on the 28th 1, Saturday 1, Sunday 1 |
| `calendar.meeting.add` | meeting.free | common_free 8, first_free 7, nearest_free 7 |
| `calendar.meeting.add` | meeting.length | 1 2, 45 1, 2 1, 20 1, 15 1, 30 1 |
| `calendar.meeting.add` | meeting.notes | bring the Q3 figures 1, discuss the vendor contract 1, we'll go through the Q4 roadmap 1, Budget overrun and next steps 1, Bring laptops for the demo 1, confirm the hotel booking 1, he wants the competitor analysis first 1, Share Figma link 1, it's about the parental leave handover 1, bring the contract 1, pricing 1, ask about his trip 1, remember the gift card 1 |
| `calendar.meeting.add` | meeting.people | Lee 28, Ana 26, Priya 21, Mihai 20, coach Dan 1 |
| `calendar.meeting.add` | meeting.room | the Board room 2, the Focus pod 2, the Cedar room 1, the board room 1, Cedar room 1 |
| `calendar.meeting.add` | meeting.time | 2pm 4, 11 4, 10 4, 3 3, 3pm 2, 4pm 2, noon 2, 1pm 2, 9:30 2, 4 2, 10:30 1, 9am 1, afternoon 1, morning 1, 9 1, 5pm 1, 8am 1, 6 1, 2 1 |
| `calendar.meeting.add` | meeting.title | Roadmap chat 1, Hiring debrief 1, Retro 1, Partner pitch 1, Parent-teacher 1, Party planning 1, Design sync 1, Kickoff 1, offsite planning 1 |
| `calendar.meeting.change` | meeting.calendar | Family 9, Work 8, Gym 4, Book club 1, family 1 |
| `calendar.meeting.change` | meeting.length | 45 1, 1 1, 2 1, 15 1, 20 1, 75 1, 0.5 1 |
| `calendar.meeting.change` | meeting.notes | bring the updated forecast 1, Review the onboarding screens 1, Room code 2291 1, Everyone brings two questions 1, I need to bring my insurance card 1, call in from home 1, bring a mat 1 |
| `calendar.meeting.change` | meeting.people | Priya 8, Lee 7, Mihai 6, Ana 5, Ben 1, Noor 1 |
| `calendar.meeting.change` | meeting.room | the Board room 7, the Focus pod 5, the Cedar room 5, Focus pod 2, Cedar room 2, Atrium 1, Dock 1, board room 1, the board room 1, the Oak room 1, the focus pod 1 |
| `calendar.meeting.change` | meeting.title | Finance sync 1, Team review 1, Design jam 1, Planning sync 1, Lunch with Sam and Jo 1, Standup 1, Hot yoga 1, Lunch with Sam and kids 1 |
| `calendar.meeting.move` | meeting.day | Friday 3, Monday 2, Thursday 1, Dec 3 1, next Tuesday 1, the 24th 1, tomorrow 1 |
| `calendar.meeting.move` | meeting.shift | 30 5, 1 4, -15 2, -1 2, -2 1, 45 1, 20 1, -30 1, 15 1, 40 1 |
| `calendar.meeting.move` | meeting.time | 3pm 2, 10:30 1, noon 1, 4:15 1, 7 in the evening 1, 9am 1, 1 1, afternoon 1 |
| `calendar.person.add` | person.name | Tom 1, Elena Popescu 1, Jamal 1, Sofia 1, Kenji 1, Olga 1, Dr. Hughes 1, Marta Silva 1, Noor 1, Ben 1, Carla Mendes 1, Radu 1, Grace 1, Felix Wong 1, Dana 1, Leo 1, Aisha 1, Hannah 1, Viktor 1, Gary 1, Zoe 1 |
| `calendar.person.change` | person.name | Priya Nair 2, Lee Chen 1, Mike 1, Ana Ionescu 1, Dr. Lee 1, Priya S. 1, Mihai Popa 1, Annie 1, Priya Shah 1, Lee from Sales 1, Thom 1, Mihai B. 1, Ana (design) 1, Leeroy Jenkins 1, Michael 1, Pri 1, Anastasia 1, Lenny 1, Lee K. 1, Ana Maria 1, Mihai Dan 1 |
| `calendar.room.add` | room.location | on the 3rd floor 1, in building B 1, on the ground floor 1, in the east wing 1, next to the kitchen 1, at the Cluj office 1, level 2, by the lifts 1, up on the 7th floor 1, at 12 Market Street 1, right by reception 1, in the basement 1, on the mezzanine 1, in the London office 1, on the top floor, above the canteen 1, on the 2nd floor 1, upstairs 1, in the west wing 1, 4th floor 1, near the entrance 1, in the annex 1, downstairs 1 |
| `calendar.room.add` | room.name | Oak room 2, Studio B 2, the Library 1, Quiet corner 1, Atrium 1, Maple 1, the Phone booth 1, Willow 1, Harbour 1, Pine room 1, Nook 1, Auditorium 1, Birch 1, the Garden room 1, Lighthouse 1, Kepler 1, Orion 1, Hazel 1, Summit 1, Annex 1, the Welcome room 1, Vault 1, Perch 1, Dock 1, the Rooftop room 1 |
| `calendar.room.add` | room.seats | 6 2, 12 1, 8 1, 20 1, 4 1, 150 1, 10 1 |
| `calendar.room.change` | room.location | to the 3rd floor 1, in building C 1, the ground floor 1, the east wing 1, next to the kitchen 1, level 5 1, to the Bucharest office 1, on the 1st floor 1, up on the 6th floor 1, to the north wing, by the lifts 1, to building A 1, behind reception, past the coffee machine 1, in the basement 1, at 40 King Street, 2nd floor 1, 4th floor 1, upstairs 1, in the annex 1, on level 3 1, west wing 1, downstairs 1, to floor 9 1 |
| `calendar.room.change` | room.name | Redwood 1, Quiet pod 1, the Boardroom 1, Conference room A 1, Pod 1 1, Cedar lounge 1, Oak hall 1, Room 301 1, Danube 1, Cedar studio 1, Phone booth 1, Lounge 1, Think tank 1, Cedar 2 1, Main room 1, Atlas 1, the Hive 1, Pod A 1, Spruce 1, Willow 1, Nest 1, Cedar A 1 |
| `calendar.room.change` | room.seats | 2 3, 1 2, 14 1, 10 1, 16 1, 6 1, 3 1, 20 1, 8 1, 4 1, 9 1, 12 1, 18 1, 30 1, 22 1, 5 1, 7 1, 11 1 |
| `diagram.group.change` | group.colour | teal 2, blue 1, orange 1, purple 1, navy 1, green 1, gray 1, pink 1, gold 1 |
| `diagram.group.change` | group.label | Sign-off 1, Business units 1, Revenue 2026 1, Executive team 1, Customer survey, May 1, Checks 1, Legal 1 |
| `diagram.group.change` | group.size | large 3, huge 2, medium 2, small 1, tiny 1 |
| `diagram.group.chart` | chart.title | Customer ratings 1, Revenue share 1, Team sizes 1, Revenue 2026 by quarter 1, Satisfaction profile 1, Score vs age 1, Mix 1 |
| `diagram.group.chart` | chart.type | bar 4, pie 4, line 4, doughnut 4, radar 4, scatter 4, polarArea 3 |
| `diagram.group.chart.adopt` | group.id | Sales by region 11, Monthly visitors 11 |
| `diagram.group.chart.make` | group.label | Headcount 1, Budget split 1, Traffic sources 1, Signups per week 1, Votes by colour 1, Bugs 1, Time spent 1 |
| `diagram.group.chart.make` | group.labels | Travel 2, North 1, South 1, East 1, Rent 1, Food 1, Jan 1, Feb 1, Mar 1, Apr 1, yes 1, no 1, Mobile 1, Desktop 1, Tablet 1, Q1 1, Q2 1, Q3 1, cats 1, dogs 1, Mon 1, Tue 1, Wed 1, Sales 1, Support 1 |
| `diagram.group.chart.make` | group.layout | bar 5, pie 4, line 3, doughnut 2 |
| `diagram.group.chart.make` | group.values | 25 3, 9 3, 14 3, 15 3, 3 3, 12 2, 30 2, 40 2, 5 2, 10 2, 2 2, 4 2, 18 1, 35 1, 11 1, 62 1, 38 1, 120 1, 80 1, 22 1, 60 1, 55 1, 52 1, 61 1, 7 1 |
| `diagram.group.layout` | group.layout | tree 1, column 1, bar 1, pie 1, free 1, grid 1, line 1, doughnut 1 |
| `diagram.group.make` | group.ids | Review 18, Publish 14, Start 12, Done 10, Support 8, Sales 7, Marketing 7, North 7, South 7, Approved? 6, the diamond 5, Engineering 5, the Note 5, these 3, them 3, the circle 2, the CEO 2, The CEO 1, the selected shapes 1, the selection 1 |
| `diagram.group.make` | group.label | Quality gate 1, Go live 1, Revenue teams 1, Phase 1 1, Tech 1, Domestic 1, Archive 1, Final checks 1, Legal 1, Leadership team 1, Inputs 1, Ship it 1, Customer care 1, 2026 targets 1, Draft 1, Checks 1, Field 1, Optional 1, Kickoff 1, Decide 1, Totals 1 |
| `diagram.group.make` | group.name | Intake 2, Release 2, Go to market 1, Checks 1, Product 1, Regions 1, Endgame 1, Decision 1, Front office 1, Sign-off 1, Customer 1, Wrap-up 1, Main path 1, Backlog 1, Delivery 1, Ops 1, Phase two 1, Edge cases 1, Ends 1, Territories 1 |
| `diagram.group.place` | group.x | 400 1, 100 1, 650 1, 500 1, 120 1, 300 1, 50 1 |
| `diagram.group.place` | group.y | 200 1, 300 1, 80 1, 40 1, 260 1, 150 1, 420 1 |
| `diagram.group.resize` | group.scale | 2 8, 1.5 3, 3 3, 0.5 3, 1 2, 0.8 1, 1.25 1, 2.5 1, 0.6 1, 1.2 1, 4 1, 1.75 1, 0.75 1, 0.9 1, 1.1 1 |
| `diagram.ids.show` | page.duration | 10 1, 5 1, 30 1, 20 1, 3 1, 8 1, 15 1, 60 1 |
| `diagram.ids.show` | page.mode | always 23, temporary 22, off 22 |
| `diagram.link.change` | @kind | arrow 46, connection 8, line 7, link 3 |
| `diagram.link.change` | link.arrow | both 3, none 3, forward 2 |
| `diagram.link.change` | link.colour | red 1, green 1, gray 1, blue 1, black 1, orange 1, purple 1 |
| `diagram.link.change` | link.label | manual 1, yes 1, submit 1, on release 1, ready 1, reports 1, check 1, approved 1 |
| `diagram.link.change` | link.style | dashed 4, dotted 3, solid 2 |
| `diagram.link.change` | link.to | Publish 5, Done 4, the Note 3, Review 3, Approved? 2, Marketing 1, Sales 1, Support 1, Start 1, the circle 1 |
| `diagram.link.change` | link.width | 3 1, 5 1, 1 1, 4 1, 2 1, 6 1 |
| `diagram.link.make` | @kind | arrow 6, line 2, connection 1 |
| `diagram.link.make` | link.from | Approved? 2, Start 2, Review 1, Sales 1, Engineering 1, North 1, Note 1, Publish 1 |
| `diagram.link.make` | link.to | Done 6, Publish 5, Review 4, Marketing 2, Support 2, South 2, Start 2, Approved? 2, the Note 2, Note 1, the diamond 1, the CEO 1, Sales 1, the circle 1 |
| `diagram.node.change` | @kind | diamond 7, circle 5 |
| `diagram.node.change` | node.colour | green 3, blue 3, orange 1, dark red 1, bright yellow 1, navy 1, purple 1, pink 1, red 1 |
| `diagram.node.change` | node.label | Peer review 1, Begin 1, Approved by legal? 1, Finished 1, Go live 1, End 1, Draft only 1, Release 1, Manager approval 1, Growth 1, Code review 1, Shipped! 1, Managing director 1, Request received 1, Checks 1, Intake 1, TODO 1, Helpdesk 1, Ship 1, R&D 1, Closed 1, Waiting 1, Pending sign-off 1, Retry 1 |
| `diagram.node.change` | node.size | big 12, small 10, huge 6, default 5, tiny 3 |
| `diagram.node.change` | node.value | 42 1, 18 1, 7.5 1, 125 1, 120 1, 3 1, 64 1, 10 1, 0 1 |
| `diagram.node.layout` | node.layout | row 3, grid 1, tree 1, circle 1, column 1, radial 1, layers 1 |
| `diagram.node.make` | @kind | diamond 8, hexagon 8, ellipse 8, circle 8, star 7, rectangle 7, triangle 6, square 6, text 3, box 2 |
| `diagram.node.make` | node.colour | green 2, red 2, yellow 2, orange 1, light blue 1, purple 1, teal 1, blue 1, gold 1, grey 1, pink 1 |
| `diagram.node.make` | node.label | Archive 2, Budget ok? 1, Cancelled 1, Notify subscribers 1, Legal check 1, Translate 1, QA 1, Deploy 1, Stop 1, Retry? 1, Board 1, v2 1 |
| `diagram.node.make` | node.layout | row 2, column 2, grid 1, tree 1, circle 1, layers 1, radial 1 |
| `diagram.node.make` | node.n | 3 4, 2 3, 4 2, 6 2, 5 1, 10 1, 7 1, 8 1 |
| `diagram.node.make` | node.size | big 4, small 4, tiny 2, huge 2, default 2 |
| `diagram.node.make` | node.x | 200 1, 400 1, 320 1, 700 1, 520 1, 50 1, 100 1, 600 1 |
| `diagram.node.make` | node.y | 150 1, 80 1, 240 1, 300 1, 410 1, 60 1, 30 1, 90 1 |
| `diagram.node.place` | @kind | diamond 4, circle 2 |
| `diagram.node.place` | node.at | center 3, top_left 2, background 2, foreground 2, right 2, middle 2, bottom_left 2, bottom 2, top_right 2, corner 2, bottom_right 1, top 1, left 1 |
| `diagram.node.place` | node.x | 300 2, 640 2, 500 2, 520 1, 410 1, 40 1, 700 1, 350 1, 600 1, 260 1, 20 1, 90 1, 380 1, 220 1, 150 1, 120 1 |
| `diagram.node.place` | node.y | 200 2, 120 1, 240 1, 180 1, 60 1, 50 1, 20 1, 300 1, 140 1, 320 1, 30 1, 150 1, 160 1, 400 1, 480 1, 90 1, 250 1, 0 1 |
| `diagram.node.remove` | @kind | diamond 2, circle 1, text 1 |
| `diagram.node.resize` | node.height | 80 3, 90 3, 60 2, 70 2, 120 1, 40 1, 100 1, 140 1, 50 1, 56 1, 30 1 |
| `diagram.node.resize` | node.width | 200 2, 150 2, 140 2, 130 1, 160 1, 180 1, 90 1, 300 1, 240 1, 210 1, 260 1, 320 1, 220 1, 250 1 |
| `diagram.node.select` | @kind | diamond 4, circle 2 |
| `diagram.node.select` | node.edges | its arrows 2, links 2, all of its connections 1, the lines attached to it 1, its outgoing arrow 1, the arrow that leads into it 1, every link coming out of it 1, its edges 1, the connectors on both sides 1, the arrows going in and out 1, its connection to the CEO 1, the arrows 1, the arrow that leaves it 1, its incoming link 1, its arrow 1, connections 1, its lines 1, arrows 1, edges 1, whatever connects to it 1 |
| `diagram.observe` | @kind | arrow 6, group 5, diamond 4, chart 3, rectangle 2, circle 2, text 1, ellipse 1 |
| `document.block.align` | block.align | center 3, justify 2, right 2, left 2 |
| `document.block.change` | @kind | paragraph 3, heading 3, table 1 |
| `document.block.change` | block.kind | paragraph 8, quote 7, heading 7 |
| `document.block.change` | block.level | 4 2, 3 2, 5 1, 6 1 |
| `document.block.change` | block.name | Costs 2027 1, History 1, Groceries 1, Quote from Lena 1, Action items 1, Opening 1, Wrap-up 1 |
| `document.block.make` | @kind | heading 10, paragraph 4, quote 3 |
| `document.block.make` | block.level | 4 3, 3 2, 5 2, 6 1 |
| `document.block.make` | block.text | The office move is scheduled for June. 1, Best service we have ever had. 1, Open Issues 1, Supplier delays could push the launch by a month. 1, This saves me an hour a day 1, Thanks to everyone who helped. 1, Next Steps 1, Dependencies 1, Edge cases 1, Footnotes 1, Mitigation 1, Notes 1, Costs 1, A clear market leader. 1 |
| `document.block.mark` | @kind | paragraph 9, quote 2, item 2, list 1 |
| `document.block.mark` | block.attrs | yellow 1, green 1, https://example.com/pricing 1, https://acme.org 1, https://intranet.example.com/handbook 1, https://reviews.example.com/42 1, https://forms.example.com/survey 1, mailto:team@example.com 1, https://github.com/example/app 1, the Timeline section 1, https://sheets.example.com/budget 1, https://example.com/report-2025 1, https://events.example.com/register 1, https://vendor.example.net 1, https://docs.example.com/v3 1, https://wiki.example.com/onboarding 1, https://example.com 1, www.example.org 1 |
| `document.block.mark` | block.mark | link 24, bold 7, italic 5, highlight 5, strike 4, underline 4, code 3 |
| `document.block.mark` | block.text | TBD 2, This document tracks the move to the new office. 1, oat milk 1, 850 1, 950 1, We finished two weeks early. 1, call the landlord 1, water the plants 1, We shipped on time and under budget. 1, Known Risks 1, Fast, friendly and reliable. 1, The project started in March 2026 with a team of four. 1, Welcome to the project notes. 1, Hello team! 1 |
| `document.block.reorder` | @kind | quote 1, table 1 |
| `document.block.select` | @kind | paragraph 7, quote 1 |
| `document.block.select` | block.from | 3 1, 10 1, 0 1, 5 1, 12 1, 20 1, 8 1 |
| `document.block.select` | block.to | 12 1, 25 1, 40 1, 18 1, 30 1, 35 1, 15 1, 14 1 |
| `document.compose` | text.about | about social media 1, of the project 1, of the office move 1, about urban cycling 1, about a brave snail 1, on the history of jazz 1, bio 1, on sleep 1, on renewable energy 1, about a lost dog finding its way home 1, on the French Revolution 1, for a new bike lane 1, about the yeast experiment 1, of home composting tips 1, for paella 1, of the conference 1, about pirates 1, of the town's tea houses 1, about the spring launch 1, on our customer survey 1, about the Roman empire 1, on sleep hygiene 1, about twins 1, on AI ethics 1, to beekeeping 1 |
| `document.compose` | text.chapters | 3 8, 2 5, 5 3, 4 3, 6 2, 8 1, 10 1 |
| `document.compose` | text.genre | essay 3, report 3, story 3, summary 2, announcement 2, list 2, article 1, poem 1, proposal 1, lab_report 1, recipe 1, review 1, newsletter 1, itinerary 1, memo 1, speech 1, note 1, cv 1 |
| `document.compose` | text.words | 300 1, 150 1, 80 1, 500 1, 200 1, 1000 1, 50 1, 400 1, 250 1, 60 1, 120 1 |
| `document.list.change` | block.checked | Buy milk 1, send invoice 1, eggs 1, called the bank 1, book dentist 1, bread 1, pay rent 1 |
| `document.list.change` | block.items | oat milk 1, renew passport 1, pay rent 1, bread 1, coffee 1, rice 1, email Sam 1, book flights 1, update CV 1, tomatoes 1, call mum 1, water plants 1 |
| `document.list.change` | block.style | numbered 3, task 3, bullet 2 |
| `document.list.make` | @kind | list 16, table 7, paragraph 7, quote 5, heading 3 |
| `document.list.make` | block.items | eggs 1, flour 1, sugar 1, Draft 1, Review 1, Publish 1, book venue 1, send invites 1, order cake 1, back up the data 1, update the server 1, test the login 1, call the plumber 1, pick tiles 1, apples 1, pears 1, Monday 1, Tuesday 1, passport 1, charger 1, socks 1, salad 1, bread 1, drinks 1, Dune 1 |
| `document.list.make` | block.name | Packing list 1, Onboarding steps 1, Open questions 1, Potluck 1, Reading list 1, Gifts 1, Launch prep 1, Ideas 1, Team roster 1, Sprint schedule 1, Milestones 1, Scores 1, Inventory 1, Contacts 1, Next steps 1, Board feedback 1, risks-header 1, Legal note 1, Disclaimer 1, Testimonial 1, Recap 1 |
| `document.list.make` | block.style | task 5, bullet 3, numbered 3 |
| `document.observe` | @kind | chapter 4, paragraph 3, subchapter 3, table 3, list 2, quote 2, heading 2, item 2, row 1 |
| `document.rewrite` | text.length | short 11, long 6, very_short 2, medium 2, very_long 2 |
| `document.rewrite` | text.tone | friendly 2, enthusiastic 2, polite 2, persuasive 2, firm 2, simple 2, neutral 2, serious 2, formal 2, apologetic 2, humorous 2, informal 2, cold 2, warm 2 |
| `document.section.change` | @kind | chapter 5, subchapter 1 |
| `document.section.change` | section.align | center 2, right 2, left 2, justify 2 |
| `document.section.change` | section.level | 2 3, 1 2, 3 2 |
| `document.section.change` | section.name | roadmap-section 1, Schedule block 1, Wrap up 1, Opening 1, targets-2027 1, Appendix 1, Execution 1 |
| `document.section.change` | section.text | Roadmap 1, Schedule and milestones 1, Lessons Learned 1, Getting Started 1, Goals and Targets 1, Budget 1, Next Steps 1 |
| `document.section.make` | @kind | chapter 26, subchapter 17, section 4 |
| `document.section.make` | section.name | appendix-a 1, Vendor review 1, methods-ch 1, Pricing model 1, Execution 1, Extras 1, faq 1, Credits 1 |
| `document.section.make` | section.order | after 13, before 6, top 2, first 2, bottom 1 |
| `document.section.make` | section.order_anchor | Plan 3, Goals 3, Timeline 3, this one 2, the Conclusion 2, the Plan chapter 1, the Timeline subchapter 1, Introduction 1, the Introduction chapter heading 1, the conclusion 1, the last one 1 |
| `document.section.make` | section.text | Results 2, Hiring plan 1, Open Questions 1, Budget and Costs 1, Success metrics 1, Appendix 1, Risks and Mitigations 1, Methods 1, Summary of Findings 1, Constraints 1, Preface 1, Appendix B 1, Dependencies 1, Background 1, Budget Phases 1, Scope 1, Audience 1, Lessons Learned 1, Overview 1, Summary 1, Draft 2 1 |
| `document.section.mark` | @kind | chapter 3, subchapter 1, heading 1 |
| `document.section.mark` | section.mark | bold 7, underline 5, italic 4, highlight 4, strike 4, code 2, link 2 |
| `document.section.remove` | @kind | chapter 1, subchapter 1 |
| `document.section.reorder` | section.order | before 2, after 1, swap 1, top 1, last 1, bottom 1, first 1 |
| `document.section.reorder` | section.order_anchor | the Plan chapter 1, Goals 1, Plan 1 |
| `document.section.select` | @kind | chapter 5, heading 2, subchapter 1 |
| `document.table.change` | block.header | true 5, false 3 |
| `document.table.change` | block.rows | Travel 1, 300 1, Item 1, Cost 1, Venue 1, 1500 1, Catering 1, 900 1, Notes 1, Licences 1, 450 1, Printing 1, Marketing 1, 2000 1, Food 1, 250 1 |
| `document.table.make` | block.header | true 5, false 3 |
| `document.table.make` | block.name | Expenses 1, Room prices 1 |
| `document.table.make` | block.rows | Item 2, Cost 2, Price 2, Rent 1, 800 1, Name 1, Role 1, Ana 1, Designer 1, Sam 1, Developer 1, Monday 1, gym 1, Wednesday 1, swim 1, Vendor 1, Acme 1, 1200 1, Globex 1, 950 1, Phase 1, Start 1, Design 1, March 1, Build 1 |
| `document.title.change` | document.title | Q3 Launch Plan 1, Team Offsite 2027 1, Kitchen Renovation 1, Website Relaunch Notes 1, Annual Budget Review 1, Grant Proposal Draft 1, Meeting Minutes 1 |
| `document.write` | text.about | about the broken heating 1, announcing the new office hours 1, on this quarter's sales 1, for a junior designer position 1, about a lighthouse keeper 1, for today's budget review 1, about our new mobile app 1, for a community garden 1, the dishwasher we bought broke after a week 1, a surprise party on Saturday 1, for three days in Rome 1, about growing up together 1, about the volunteer programme and the new opening times 1, on the pendulum experiment we ran yesterday 1, thank-you 1, about autumn 1, for pancakes 1, about the parking changes 1, about climate change 1, of the new pizza place 1, on remote work 1, of recommendation for my former intern Jonas 1, about the school trip on Thursday 1, for the curator job 1, for the board meeting 1 |
| `document.write` | text.content | Passport, charger, sunscreen. 1, Water the plants on Friday. 1, Meeting moved to 3 pm, room B. 1, Network: Home5G, password on the fridge. 1, Thanks for coming to the workshop. Slides follow by email. 1, back at 2 1, buy stamps 1 |
| `document.write` | text.genre | letter 2, email 2, cover_letter 2, minutes 2, press_release 2, complaint 2, invitation 2, report 1, story 1, proposal 1, itinerary 1, speech 1, newsletter 1, lab_report 1, note 1, poem 1, recipe 1, memo 1, cv 1, review 1, article 1 |
| `document.write` | text.title | Trip to Lisbon 1, Wedding Checklist 1, Sprint 14 Retro 1, Garden Plans 2027 1, Book Club Picks 1, Interview Questions 1, Packing 1, Reminder 1, Wifi 1 |
| `drawing.catalog.make` | @kind | windmill 3, tent 3, bench 3, bicycle 2, chair 2, castle 2, horse 2, lamp post 2, man 1, lighthouse 1, giraffe 1, bus 1, snowman 1, umbrella 1, bridge 1, kite 1 |
| `drawing.catalog.make` | drawn.size | huge 2, small 2, big 1, 40 1, tiny 1, 25 1, 90 1 |
| `drawing.catalog.make` | drawn.x | 220 1, 520 1, 130 1, 250 1, 380 1, 90 1, 450 1, 60 1, 600 1 |
| `drawing.catalog.make` | drawn.y | 410 1, 140 1, 260 1, 380 1, 300 1, 350 1, 330 1, 420 1, 200 1 |
| `drawing.ids.show` | page.duration | 6 1, 10 1, 3 1, 15 1, 8 1, 5 1, 20 1, 2 1, 30 1 |
| `drawing.ids.show` | page.mode | off 23, always 22, temporary 19 |
| `drawing.object.change` | @kind | sun 11, house 9, cloud 9, lake 9, mountain 8, boat 6, car 5, road 3, heart 1, dog 1, square 1, triangle 1, tree 1 |
| `drawing.object.change` | drawn.color | green 3, grey 3, blue 2, orange 2, purple 2, white 2, dark grey 2, yellow 2, turquoise 1, red 1 |
| `drawing.object.change` | drawn.height | 70 4, 60 3, 120 2, 90 2, 110 2, 150 2, 140 2, 50 2, 40 1, 200 1, 95 1, 80 1, 65 1, 55 1, 45 1, 300 1, 130 1, 100 1, 210 1, 30 1 |
| `drawing.object.change` | drawn.label | Home Sweet Home 1, Taxi 1, Crystal Water 1, Lucky Star 1, Ancient Oak 1, Rainy 1, Everest 1, Morning 1, Rain 1, Ferry 1, Exit 1 |
| `drawing.object.change` | drawn.name | Speedy 1, Grandpa Tree 1, Silver Pond 1, Mount Bold 1, Villa Rosa 1, Wanderer 1, Polaris 1, Valentine 1, Hay Store 1, Biscuit 1, Dawn 1, Main Street 1, Orchard 1, Golden Acre 1, Block A 1, Main House 1, Zoom 1, Mirror Pond 1, Bubbles 1, Nautilus 1, Pyramid 1, Sunny 1, Ben Nevis 1, Sir Oakley 1, Rocket 1 |
| `drawing.object.change` | drawn.size | big 9, small 7, 70 2, 80 1, 140 1, 55 1, 100 1, 200 1, 60 1, 250 1, 45 1, 150 1, 90 1 |
| `drawing.object.change` | drawn.width | 90 4, 300 3, 140 2, 180 2, 120 2, 80 2, 70 2, 60 2, 100 2, 160 1, 500 1, 200 1, 110 1, 50 1, 250 1, 75 1, 450 1, 130 1, 260 1, 320 1, 55 1 |
| `drawing.object.change` | drawn.x | 300 2, 450 1, 120 1, 340 1, 260 1, 200 1, 70 1, 520 1 |
| `drawing.object.change` | drawn.y | 60 1, 70 1, 280 1, 410 1, 330 1, 380 1, 40 1, 80 1 |
| `drawing.object.group` | drawn.label | Home 1, Sky 1, Buildings 1, Shapes 1, Harbour 1, Traffic 1, Favourites 1, Orchard Area 1, Highlands 1, Town 1, Farmyard 1, Awards 1, Daylight 1, Smith Farm 1, Garden 1, Daytime 1, Basics 1, Farm Buildings 1, Marina 1, Love 1, Commute 1, Shade 1 |
| `drawing.object.group` | drawn.name | Homestead 1, Sky Pair 1, Pair 1, Buildings 1, Street Scene 1, Harbour 1, Weather 1, Duo 1 |
| `drawing.object.make` | @kind | star 7, cloud 6, tree 6, heart 5, circle 5, car 5, flower 5, cat 5, rectangle 5, boat 4, bird 4, fish 4, balloon 4, dog 4, sun 4, lake 4, house 4, triangle 3, moon 3, field 3, rainbow 2, rocket 2, person 2, square 2, mountain 2 |
| `drawing.object.make` | drawn.at | top_left 2, top_right 2, middle 1, bottom 1, center 1, background 1, left 1, top 1, corner 1, foreground 1, bottom_right 1 |
| `drawing.object.make` | drawn.color | yellow 2, green 2, pink 2, brown 2, blue 2, red 2, purple 1, silver 1, orange 1, white 1, black 1 |
| `drawing.object.make` | drawn.height | 90 2, 40 2, 80 1, 60 1, 70 1, 50 1, 120 1, 100 1 |
| `drawing.object.make` | drawn.label | Home 1, Winner 1, EXIT 1, Start 1, Blue Lagoon 1, Taxi 1, Shop 1, Mum 1, this way 1, Warning 1 |
| `drawing.object.make` | drawn.name | Rex 1, Big Willow 1, Fluffy 1, Anna 1, Mittens 1, Sea Breeze 1, Nemo 1, Tweety 1, Ball 1, Cottage 1 |
| `drawing.object.make` | drawn.relation | next_to 2, below 2, on 1, above 1, in_front_of 1, between 1, along 1, in 1, near 1, around 1, under 1, inside 1 |
| `drawing.object.make` | drawn.size | small 6, huge 3, tiny 3, big 3, 60 1, 120 1, 45 1, 90 1, 30 1, 35 1, 25 1, 70 1, 20 1, 50 1 |
| `drawing.object.make` | drawn.width | 200 1, 120 1, 300 1, 140 1, 360 1, 220 1, 100 1, 80 1, 160 1, 400 1, 500 1 |
| `drawing.object.make` | drawn.x | 200 1, 80 1, 420 1, 150 1, 90 1, 310 1, 250 1, 500 1, 300 1 |
| `drawing.object.make` | drawn.y | 150 1, 300 1, 60 1, 380 1, 340 1, 90 1, 330 1, 50 1, 400 1, 420 1 |
| `drawing.object.place` | @kind | car 10, sun 8, cloud 7, boat 5, mountain 5, house 4, lake 4, road 2, tree 2, dog 1 |
| `drawing.object.place` | drawn.at | top_right 3, bottom 3, top 3, background 3, corner 3, top_left 2, foreground 2, center 2, left 2, bottom_right 2, middle 1, right 1, bottom_left 1 |
| `drawing.object.place` | drawn.direction | left 3, up 3, right 1, down 1, apart 1, forward 1, closer 1, backward 1 |
| `drawing.object.place` | drawn.distance | 40 1, 25 1 |
| `drawing.object.place` | drawn.relation | next_to 2, on 1, above 1, behind 1, near 1, in_front_of 1, left_of 1, along 1, right_of 1, below 1, outside 1 |
| `drawing.object.place` | drawn.x | 100 1, 480 1, 260 1, 330 1, 210 1, 150 1, 240 1, 520 1, 400 1, 300 1, 120 1 |
| `drawing.object.place` | drawn.y | 200 2, 50 1, 410 1, 90 1, 360 1, 220 1, 390 1, 30 1, 180 1, 340 1 |
| `drawing.object.remove` | @kind | cloud 1, mountain 1, road 1, sun 1, lake 1, house 1 |
| `drawing.object.select` | @kind | house 1, lake 1, mountain 1, sun 1, cloud 1, road 1, boat 1 |
| `drawing.observe` | @kind | house 5, car 4, tree 3, cloud 2, star 2, lake 2, bird 1, boat 1, sun 1, mountain 1, dog 1 |
| `drawing.part.change` | part.color | red 1, brown 1, black 1, autumn orange 1, grey 1, blue 1, yellow 1, pink 1 |
| `drawing.part.change` | part.height | 50 1, 45 1, 90 1, 35 1, 36 1, 120 1, 25 1, 85 1 |
| `drawing.part.change` | part.index | 2 1, 3 1 |
| `drawing.part.change` | part.width | 30 1, 20 1, 25 1, 40 1, 36 1, 160 1, 80 1, 60 1 |
| `drawing.part.place` | part.x | 210 1, 180 1, 150 1, 320 1, 90 1, 230 1, 160 1, 300 1, 410 1 |
| `drawing.part.place` | part.y | 95 1, 260 1, 220 1, 430 1, 240 1, 90 1, 210 1, 440 1, 170 1 |
| `drawing.part.select` | part.index | 2 4, 3 2, 4 1, 5 1, 1 1 |

## UI controls (buttons, forms) and their cases

| tab | control | case | before | new | after |
| --- | --- | --- | ---: | ---: | ---: |
| drawing | Selection dropdown | `drawing.object.select:core` | 62 | 10 | 72 |
| drawing | Move (x, y fields) | `drawing.object.place:position` | 61 | 11 | 72 |
| drawing | Delete (selection) | `drawing.object.remove:selected` | 0 | 25 | 25 |
| drawing | Clear drawing | `drawing.page.clear:core` | 30 | 9 | 39 |
| diagram | Selection (many) | `diagram.node.select:core` | 84 | 31 | 115 |
| diagram | Label field | `diagram.node.change:label` | 38 | 25 | 63 |
| diagram | Colour options | `diagram.node.change:colour` | 2,044 | 14 | 2,058 |
| diagram | Size options | `diagram.node.change:size` | 3 | 23 | 26 |
| diagram | Connect to | `diagram.link.make:from-selection` | 0 | 22 | 22 |
| diagram | Delete (selection) | `diagram.node.remove:selected` | 0 | 22 | 22 |
| diagram | Clear diagram | `diagram.page.clear:core` | 26 | 8 | 34 |
| calendar | Add event (Title, Start, Minutes) | `calendar.event.add:duration` | 47 | 10 | 57 |
| calendar | Selection | `calendar.event.select:core` | 29 | 8 | 37 |
| calendar | Rename (Title) | `calendar.meeting.change:rename` | 102 | 9 | 111 |
| calendar | Move (Start) | `calendar.meeting.move:time` | 641 | 10 | 651 |
| calendar | Delete (selection) | `calendar.meeting.remove:selected` | 0 | 22 | 22 |
| document | + Chapter / + Subchapter | `document.section.make:kind` | 1,260 | 47 | 1,307 |
| document | + Paragraph / + Heading / + Quote | `document.block.make:kind` | 319 | 25 | 344 |
| document | + List | `document.list.make:core` | 90 | 10 | 100 |
| document | + Table | `document.table.make:core` | 62 | 16 | 78 |
| document | B / I / U / S / Code / Highlight | `document.block.mark:mark` | 93 | 55 | 148 |
| document | Clear format | `document.block.mark:mark-off` | 0 | 24 | 24 |
| document | Clear document | `document.block.remove:all` | 0 | 22 | 22 |
| document | Undo / Redo | `document.undo:core` | 26 | 8 | 34 |
| document | Title input | `document.title.change:core` | 59 | 8 | 67 |
| document | Label field (inspector) | `document.block.change:name` | 67 | 8 | 75 |
| document | Block type select | `document.block.change:kind` | 0 | 22 | 22 |
| document | Heading level select | `document.section.change:level` | 60 | 8 | 68 |
| document | Alignment select | `document.block.align:align` | 72 | 9 | 81 |
| document | Move up / Move down / drag | `document.block.reorder:core` | 51 | 8 | 59 |
| document | Delete block / Delete section | `document.block.remove:selected` | 27 | 8 | 35 |
| document | Edit text (inline editing) | `document.container.change:core` | 28 | 8 | 36 |
| document | List style select | `document.list.change:style` | 67 | 8 | 75 |
| document | Edit list items | `document.list.change:items` | 69 | 8 | 77 |
| document | Task checkbox | `document.list.change:checked` | 45 | 8 | 53 |
| document | Edit table cells | `document.table.change:rows` | 50 | 8 | 58 |
| document | Outline (go to section) | `document.section.select:whole` | 50 | 30 | 80 |
| avatar | Composition | `avatar.face.preset:preset` | 227 | 20 | 247 |
| avatar | Emotion | `avatar.face.expression:expression` | 102 | 19 | 121 |
| avatar | Object IDs | `avatar.ids.show:always` | 0 | 23 | 23 |
| avatar | Selection | `avatar.part.select:core` | 51 | 12 | 63 |
| avatar | Look | `avatar.part.change:variant` | 372 | 12 | 384 |
| avatar | Add | `avatar.part.add:variant` | 345 | 24 | 369 |
| avatar | Size | `avatar.part.change:size` | 259 | 14 | 273 |
| avatar | Colour | `avatar.part.change:colour` | 91 | 25 | 116 |
| avatar | Move | `avatar.part.move:place` | 143 | 11 | 154 |
| avatar | Delete | `avatar.parts.remove:core` | 28 | 10 | 38 |
