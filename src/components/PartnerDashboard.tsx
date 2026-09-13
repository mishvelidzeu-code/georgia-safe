import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import ListingLocationPicker from './ListingLocationPicker';
import CitySelect from './CitySelect';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { BODY_TYPES, MAX_LISTING_PHOTOS, changePartnerPassword, createPartnerListing, deletePartnerListing, fetchPartnerListings, LISTING_CATEGORIES, updatePartnerListing } from '../lib/rentals';
import type { ListingCategory, Partner, PartnerListing } from '../lib/rentals';
import PhotoReorderRow from './PhotoReorderRow';

const blank = (city: string) => ({ title:'', city, address:'', phone:'', hours:'', price:'', description:'', make:'', model:'', year:'', bodyType:'', transmission:'', seats:'', dailyPrice:'', latitude:null as number|null, longitude:null as number|null });

export default function PartnerDashboard({ partner, visible, onClose, embedded = false }: { partner: Partner; visible: boolean; onClose: () => void; embedded?: boolean }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<PartnerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<ListingCategory>('car_rental');
  const [draft, setDraft] = useState(blank(partner.city));
  const [photos, setPhotos] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  // The partner record is loaded by the parent only once per sign-in. Keep the
  // completed first-password-change state locally as well, so the dashboard
  // opens immediately after a successful change instead of requiring a restart.
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(partner.requiresPasswordChange);
  const [locationPicker, setLocationPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); try { setItems(await fetchPartnerListings(partner.id)); } catch { setItems([]); Alert.alert(t('admin.errorTitle'),t('admin.errorBody')); } setLoading(false); }, [partner.id,t]);
  useEffect(() => { if (visible) void load(); }, [visible,load]);
  // Re-read on every return to the tab, so an admin approval that happened while
  // the partner was elsewhere in the app shows without a restart.
  useFocusEffect(useCallback(() => { if (visible) void load(); }, [visible,load]));
  useEffect(() => { setRequiresPasswordChange(partner.requiresPasswordChange); }, [partner.id, partner.requiresPasswordChange]);
  const counts = useMemo(() => Object.fromEntries(['published','pending','hidden','rejected'].map((x) => [x,items.filter((i) => i.status === x).length])) as Record<string,number>,[items]);

  async function pickPhotos() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(t('review.permTitle'),t('review.permLibrary'));
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes:['images'], allowsMultipleSelection:true, selectionLimit:MAX_LISTING_PHOTOS-photos.length, quality:0.6, base64:true });
    if (!result.canceled) setPhotos((old) => [...old,...result.assets.map((a) => a.base64).filter((x): x is string => !!x)].slice(0,MAX_LISTING_PHOTOS));
  }
  async function save() {
    const title = category === 'car_rental' ? `${draft.make} ${draft.model}`.trim() : draft.title.trim();
    if (!title || !draft.city.trim()) return Alert.alert(t('admin.invalidTitle'),t('partnerListings.required'));
    // Body type is what the tourist filters by, so a car without one would never be found.
    if (category === 'car_rental' && !draft.bodyType) return Alert.alert(t('admin.invalidTitle'),t('rentals.bodyTypeRequired'));
    // The pin is the location; the address is whatever the geocoder read back from it.
    if (draft.latitude == null || draft.longitude == null) { setLocationPicker(true); return Alert.alert(t('admin.invalidTitle'),t('partnerListings.locationRequired')); }
    const coordinate = { latitude: draft.latitude, longitude: draft.longitude };
    setSaving(true);
    const input={ title,city:draft.city,address:draft.address||null,phone:draft.phone||partner.phone,whatsapp:draft.phone||partner.phone,workingHours:draft.hours||null,priceDescription:draft.price||null,description:draft.description||null,latitude:coordinate.latitude,longitude:coordinate.longitude,details:category==='car_rental'?{make:draft.make,model:draft.model,year:draft.year?Number(draft.year):null,body_type:draft.bodyType,transmission:draft.transmission||null,seats:draft.seats?Number(draft.seats):null,daily_price:draft.dailyPrice?Number(draft.dailyPrice):null}:{} };
    const ok = editingId ? await updatePartnerListing(editingId,input) : await createPartnerListing(partner.id,{category,...input,photosBase64:photos});
    setSaving(false);
    if (!ok) return Alert.alert(t('admin.errorTitle'),t('admin.errorBody'));
    setDraft(blank(partner.city)); setPhotos([]); setAdding(false); setEditingId(null); Alert.alert(t('rentals.carSavedTitle'),t('rentals.carSavedBody')); await load();
  }
  async function updatePassword() {
    if (password.length < 8) return Alert.alert(t('admin.invalidTitle'), t('partnerListings.passwordMin'));
    setSaving(true);
    const ok = await changePartnerPassword(password);
    setSaving(false);
    if (!ok) return Alert.alert(t('admin.errorTitle'), t('admin.errorBody'));
    setPassword('');
    setRequiresPasswordChange(false);
    void load();
    Alert.alert(t('partnerListings.passwordChanged'));
  }
  function remove(item:PartnerListing) { Alert.alert(t('admin.deleteTitle'),item.title,[{text:t('admin.cancel'),style:'cancel'},{text:t('admin.delete'),style:'destructive',onPress:async()=>{const ok=await deletePartnerListing(item.id);if(!ok)Alert.alert(t('admin.errorTitle'),t('admin.errorBody'));await load();}}]); }
  function edit(item:PartnerListing) {
    const d=item.details as Record<string,unknown>; setCategory(item.category); setEditingId(item.id); setAdding(true);
    setDraft({title:item.title,city:item.city,address:item.address??'',phone:item.phone??'',hours:item.workingHours??'',price:item.priceDescription??'',description:item.description??'',make:String(d.make??''),model:String(d.model??''),year:d.year==null?'':String(d.year),bodyType:String(d.body_type??''),transmission:String(d.transmission??''),seats:d.seats==null?'':String(d.seats),dailyPrice:d.daily_price==null?'':String(d.daily_price),latitude:item.latitude,longitude:item.longitude});
  }

  const content = <SafeAreaView style={s.container} edges={['top','bottom']}>
    <View style={s.header}><View><Text style={s.title}>{t('partnerListings.dashboard')}</Text><Text style={s.muted}>{partner.companyName}</Text></View>{!embedded&&<Pressable onPress={onClose}><Ionicons name="close" size={26} color={colors.text}/></Pressable>}</View>
    {!partner.active?<Text style={s.notice}>{t('partnerListings.disabled')}</Text>:requiresPasswordChange?<View style={s.passwordBox}><Text style={s.cardTitle}>{t('partnerListings.changePassword')}</Text><TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry placeholder={t('partnerListings.newPassword')} placeholderTextColor={colors.textMuted}/><Pressable style={s.primary} onPress={updatePassword} disabled={saving}><Text style={s.buttonText}>{t('common.save')}</Text></Pressable></View>:loading?<ActivityIndicator color={colors.safe}/>:<FlatList data={items} keyExtractor={(x)=>x.id} onRefresh={load} refreshing={loading} contentContainerStyle={s.content}
      ListHeaderComponent={<View style={{gap:12}}><View style={s.stats}>{(['published','pending','hidden'] as const).map((key)=><View key={key} style={s.stat}><Text style={s.statNumber}>{counts[key]}</Text><Text style={s.muted}>{t(`partnerListings.${key}`)}</Text></View>)}</View><Pressable style={s.primary} onPress={()=>setAdding((x)=>!x)}><Text style={s.buttonText}>+ {t('partnerListings.add')}</Text></Pressable>{adding&&<View style={s.card}><Text style={s.cardTitle}>{t('partnerListings.chooseCategory')}</Text><ScrollView horizontal>{LISTING_CATEGORIES.map((c)=><Pressable key={c} style={[s.chip,category===c&&s.chipActive]} onPress={()=>setCategory(c)}><Text style={s.chipText}>{t(`partnerListings.category.${c}`)}</Text></Pressable>)}</ScrollView>{category==='car_rental'?<><View style={s.row}><Field value={draft.make} set={(make)=>setDraft({...draft,make})} label={t('rentals.make')}/><Field value={draft.model} set={(model)=>setDraft({...draft,model})} label={t('rentals.model')}/></View><View style={s.row}><Field value={draft.year} set={(year)=>setDraft({...draft,year})} label={t('rentals.year')} numeric/><Field value={draft.seats} set={(seats)=>setDraft({...draft,seats})} label={t('rentals.seatsField')} numeric/></View><Text style={s.muted}>{t('rentals.bodyType')}</Text><View style={s.row}>{BODY_TYPES.map((bt)=><Pressable key={bt} style={[s.chip,draft.bodyType===bt&&s.chipActive]} onPress={()=>setDraft({...draft,bodyType:bt})}><Text style={s.chipText}>{t(`rentals.${bt}`)}</Text></Pressable>)}</View><View style={s.row}>{(['automatic','manual'] as const).map((tr)=><Pressable key={tr} style={[s.chip,draft.transmission===tr&&s.chipActive]} onPress={()=>setDraft({...draft,transmission:tr})}><Text style={s.chipText}>{t(`rentals.${tr}`)}</Text></Pressable>)}</View><Field value={draft.dailyPrice} set={(dailyPrice)=>setDraft({...draft,dailyPrice})} label={t('rentals.priceField')} numeric/></>:<Field value={draft.title} set={(title)=>setDraft({...draft,title})} label={t('partnerListings.name')}/>}<CitySelect value={draft.city||null} onChange={(city)=>setDraft({...draft,city:city??''})}/><Pressable style={[s.secondary,s.locationButton,draft.latitude!=null&&s.locationButtonSet]} onPress={()=>setLocationPicker(true)}><Ionicons name={draft.latitude!=null?'location':'location-outline'} size={18} color={colors.white}/><View style={{flex:1}}><Text style={s.buttonText}>{draft.latitude != null ? t('partnerListings.locationSelected') : t('partnerListings.chooseOnMap')}</Text>{draft.latitude != null && <Text style={s.locationAddress} numberOfLines={1}>{draft.address || `${draft.latitude.toFixed(5)}, ${draft.longitude?.toFixed(5)}`}</Text>}</View></Pressable><Field value={draft.phone} set={(phone)=>setDraft({...draft,phone})} label={t('profile.phoneNumber')}/>{category!=='car_rental'&&<><Field value={draft.hours} set={(hours)=>setDraft({...draft,hours})} label={t('partnerListings.hours')}/><Field value={draft.price} set={(price)=>setDraft({...draft,price})} label={t('partnerListings.price')}/></>}<Field value={draft.description} set={(description)=>setDraft({...draft,description})} label={t('rentals.descriptionField')} multiline/>{photos.length>0&&<PhotoReorderRow photos={photos} uriOf={(b64)=>`data:image/jpeg;base64,${b64}`} onChange={setPhotos}/>}<Pressable style={[s.secondary,photos.length>=MAX_LISTING_PHOTOS&&{opacity:0.5}]} disabled={photos.length>=MAX_LISTING_PHOTOS} onPress={pickPhotos}><Text style={s.buttonText}>{photos.length?t('rentals.photosOf').replace('{n}',String(photos.length)).replace('{max}',String(MAX_LISTING_PHOTOS)):t('rentals.addPhotos')}</Text></Pressable><Pressable style={s.primary} onPress={save} disabled={saving}>{saving?<ActivityIndicator color={colors.white}/>:<Text style={s.buttonText}>{t('common.save')}</Text>}</Pressable></View>}</View>}
      ListEmptyComponent={<Text style={s.notice}>{t('partnerListings.empty')}</Text>} renderItem={({item})=><View style={s.card}><Text style={s.cardTitle}>{item.title}</Text><Text style={s.muted}>{t(`partnerListings.category.${item.category}`)} · {item.city}</Text><Text style={[s.status,{color:item.reviewStatus==='pending'?colors.warning:item.status==='published'?colors.safe:item.status==='rejected'?colors.risk:colors.warning}]}>{t(`partnerListings.${item.reviewStatus??item.status}`)}</Text>{item.rejectionReason?<Text style={s.error}>{item.rejectionReason}</Text>:null}<View style={s.row}><Pressable style={s.secondary} onPress={()=>edit(item)}><Text style={s.buttonText}>{t('admin.edit')}</Text></Pressable><Pressable style={s.secondary} onPress={()=>remove(item)}><Text style={s.delete}>{t('admin.delete')}</Text></Pressable></View></View>}/>} 
    <ListingLocationPicker visible={locationPicker} city={draft.city} initial={draft.latitude != null && draft.longitude != null ? {latitude:draft.latitude,longitude:draft.longitude}:null} onClose={()=>setLocationPicker(false)} onSelect={(coordinate,address)=>{setDraft({...draft,latitude:coordinate.latitude,longitude:coordinate.longitude,address:address??''});setLocationPicker(false);}}/>
  </SafeAreaView>;
  return embedded ? content : <Modal visible={visible} animationType="slide" onRequestClose={onClose}>{content}</Modal>;
}

function Field({value,set,label,numeric,multiline}:{value:string;set:(v:string)=>void;label:string;numeric?:boolean;multiline?:boolean}) { return <TextInput style={[s.input,{flex:1},multiline&&{minHeight:70}]} value={value} onChangeText={set} placeholder={label} placeholderTextColor={colors.textMuted} keyboardType={numeric?'number-pad':'default'} multiline={multiline}/>; }
const s=StyleSheet.create({container:{flex:1,backgroundColor:colors.background},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16},title:{color:colors.text,fontSize:20,fontWeight:'700'},muted:{color:colors.textMuted,fontSize:12},content:{padding:16,paddingBottom:48,gap:10},stats:{flexDirection:'row',gap:6},stat:{flex:1,backgroundColor:colors.card,borderRadius:10,padding:8,alignItems:'center'},statNumber:{color:colors.text,fontSize:18,fontWeight:'800'},card:{backgroundColor:colors.card,borderRadius:12,padding:12,gap:8},cardTitle:{color:colors.text,fontSize:15,fontWeight:'700'},primary:{backgroundColor:colors.safe,borderRadius:10,padding:12,alignItems:'center'},secondary:{backgroundColor:colors.border,borderRadius:10,padding:12,alignItems:'center'},buttonText:{color:colors.white,fontWeight:'700'},row:{flexDirection:'row',gap:8},input:{backgroundColor:colors.background,borderColor:colors.border,borderWidth:1,borderRadius:8,padding:10,color:colors.text},chip:{borderColor:colors.border,borderWidth:1,borderRadius:999,padding:8,marginRight:6},chipActive:{backgroundColor:colors.safe},chipText:{color:colors.text,fontSize:12},status:{fontSize:12,fontWeight:'700'},delete:{color:colors.risk,fontWeight:'700'},error:{color:colors.risk,fontSize:12},notice:{color:colors.textMuted,textAlign:'center',padding:24},passwordBox:{margin:16,backgroundColor:colors.card,padding:16,borderRadius:12,gap:10},locationButton:{flexDirection:'row',alignItems:'center',gap:10,justifyContent:'flex-start'},locationButtonSet:{backgroundColor:colors.safe},locationAddress:{color:colors.white,fontSize:11,opacity:0.85,marginTop:2}});
