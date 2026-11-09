# Front-end thresholds chosen on held-out training messages

fit 947 messages, dev 253 messages (1126 requests, 312 chatter sentences).
Score = dev requests made fully readable - chatter sentences where a trigger fires. Chosen: {"seg_epochs": 8, "val_min_count": 5, "val_min_prec": 0.8, "trig_min_count": 2, "trig_share": 0.75, "trig_min_prec": 0.6}

| parameter | value | readable | false triggers | score |
|---|---|---|---|---|
| val_min_count | 2 | 890 | 56 | 834 |
| val_min_count | 3 | 893 | 55 | 838 |
| val_min_count | 5 | 893 | 55 | 838 |
| val_min_prec | 0.6 | 884 | 55 | 829 |
| val_min_prec | 0.7 | 893 | 55 | 838 |
| val_min_prec | 0.8 | 897 | 55 | 842 |
| val_min_prec | 0.9 | 891 | 59 | 832 |
| trig_min_count | 2 | 897 | 55 | 842 |
| trig_min_count | 3 | 887 | 55 | 832 |
| trig_min_count | 5 | 866 | 51 | 815 |
| trig_share | 0.6 | 892 | 55 | 837 |
| trig_share | 0.75 | 897 | 55 | 842 |
| trig_share | 0.9 | 895 | 55 | 840 |
| trig_min_prec | 0.5 | 905 | 67 | 838 |
| trig_min_prec | 0.6 | 897 | 55 | 842 |
| trig_min_prec | 0.7 | 877 | 52 | 825 |
| trig_min_prec | 0.8 | 875 | 51 | 824 |
| seg_epochs | 3 | span F1 0.910 | | |
| seg_epochs | 5 | span F1 0.911 | | |
| seg_epochs | 8 | span F1 0.914 | | |
