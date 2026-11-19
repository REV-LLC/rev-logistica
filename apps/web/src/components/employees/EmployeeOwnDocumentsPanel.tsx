'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Paper, Stack, Text, Title } from '@mantine/core';
import { IconDownload, IconEye } from '@tabler/icons-react';
import { api, apiBlob } from '@/lib/api';
type File = { id: string; category: string | null; displayName: string | null; originalName: string | null; mimeType: string | null; expiresAt: string | null };
export default function EmployeeOwnDocumentsPanel() {
  const [files,setFiles]=useState<File[] | null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState<string | null>(null);
  const [preview,setPreview]=useState<{url:string;type:string;name:string}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();setError('');
    api<File[]>('/employee-portal/documents',{signal:controller.signal,cache:'no-store'}).then(data=>{if(!controller.signal.aborted)setFiles(data)}).catch(()=>{if(!controller.signal.aborted)setError('No pudimos cargar tus documentos.')});
    return()=>controller.abort();
  },[attempt]);
  useEffect(()=>{const url=preview?.url;return()=>{if(url)URL.revokeObjectURL(url)}},[preview?.url]);
  async function open(file:File,view:boolean){
    if(busy)return;setBusy(file.id);setError('');
    try{
      const blob=await apiBlob(`/employee-portal/documents/${file.id}/download`,{cache:'no-store'}),url=URL.createObjectURL(blob),name=file.displayName||file.originalName||'documento';
      if(view)setPreview({url,name,type:blob.type});
      else{const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000)}
    }catch{setError('No pudimos abrir el documento. Vuelve a intentar.')}finally{setBusy(null)}
  }
  return <Stack gap="md"><Title order={3}>Mis documentos</Title><Text size="sm" c="dimmed">Consulta y descarga los documentos de tu perfil registrados por oficina.</Text>
    {error?<Alert color="red" role="alert">{error}{files===null?<Button variant="subtle" onClick={()=>setAttempt(x=>x+1)}>Reintentar</Button>:null}</Alert>:null}
    {!files&&!error?<Text role="status">Cargando documentos…</Text>:null}
    {files?.length===0?<Text c="dimmed">Aún no tienes documentos cargados. Contacta a oficina para agregarlos.</Text>:null}
    {files?.map(file=><Paper withBorder p="md" radius="md" key={file.id}><Stack gap="xs"><Text fw={600} style={{overflowWrap:'anywhere'}}>{file.displayName||file.originalName||'Documento'}</Text><Text size="sm" c="dimmed">{(file.category||'Documento').replaceAll('_',' ')}{file.expiresAt?` · Vence ${new Intl.DateTimeFormat('es-CO',{timeZone:'UTC'}).format(new Date(file.expiresAt))}`:''}</Text><Group gap="xs" wrap="wrap">
      {file.mimeType==='application/pdf'||file.mimeType?.startsWith('image/')?<Button variant="light" leftSection={<IconEye size={16}/>} disabled={busy!==null} onClick={()=>void open(file,true)}>Ver documento</Button>:null}
      <Button variant="subtle" leftSection={<IconDownload size={16}/>} disabled={busy!==null} onClick={()=>void open(file,false)}>Descargar</Button>
    </Group></Stack></Paper>)}
    <Modal opened={Boolean(preview)} onClose={()=>setPreview(null)} title={preview?.name||'Documento'} size="xl" centered>{preview?.type==='application/pdf'?<iframe src={preview.url} title={preview.name} style={{width:'100%',height:'70dvh',border:0}}/>:preview?<img src={preview.url} alt={preview.name} style={{display:'block',maxWidth:'100%',maxHeight:'70dvh',objectFit:'contain',margin:'auto'}}/>:null}</Modal>
  </Stack>;
}
